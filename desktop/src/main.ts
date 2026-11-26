import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  BrowserWindow,
  Menu,
  app,
  ipcMain,
  net,
  protocol,
  session,
  shell,
} from "electron";

import { IPC_CHANNELS } from "./api";
import {
  APP_ORIGIN,
  APP_SCHEME,
  buildCsp,
  isAllowedNavigation,
  isAllowedPermission,
  isSafeExternalUrl,
  isTrustedSender,
  mimeTypeFor,
  resolveAppFile,
} from "./security";

import { registerExportIpc } from "./exportFile";
import { registerImageIpc } from "./imageFetch";
import { ensureWorkspace, registerWorkspaceIpc } from "./workspaceService";

import type { TuwAppInfo } from "./api";

const APP_NAME = "The Ultimate Whiteboard";

/** En desarrollo la interfaz viene del servidor de Vite (yarn desktop:dev). */
const DEV_URL = process.env.TUW_DEV_URL || null;
/** Archivos de la app web compilada (desktop/dist/app). */
const APP_DIR = path.join(__dirname, "app");
const ICON_PATH = path.join(__dirname, "..", "build", "icon.png");
const SELFTEST = process.env.TUW_SELFTEST === "1";

// Pruebas automáticas: carpeta de datos del programa y de trabajo aisladas.
if (process.env.TUW_USER_DATA) {
  app.setPath("userData", process.env.TUW_USER_DATA);
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
let csp = "";

const serveApp = () => {
  const indexPath = path.join(APP_DIR, "index.html");
  csp = buildCsp(fs.readFileSync(indexPath, "utf8"));

  protocol.handle(APP_SCHEME, async (request) => {
    const file = resolveAppFile(APP_DIR, request.url);
    if (!file) {
      return new Response("Not found", { status: 404 });
    }
    try {
      const res = await net.fetch(pathToFileURL(file).toString());
      const headers = new Headers(res.headers);
      headers.set("Content-Type", mimeTypeFor(file));
      headers.set("Content-Security-Policy", csp);
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(res.body, { status: res.status, headers });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
};

const hardenSession = () => {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(isAllowedPermission(permission)),
  );
  ses.setPermissionCheckHandler((_wc, permission) =>
    isAllowedPermission(permission),
  );
};

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    title: APP_NAME,
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    backgroundColor: "#ffffff",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });
  mainWindow = win;
  win.once("ready-to-show", () => win.show());

  // Antes de cerrar la ventana, la app guarda lo pendiente (autosave con retraso).
  let rendererWantsClose = false;
  let closing = false;
  const onRegister = (event: Electron.IpcMainEvent) => {
    if (event.sender === win.webContents) {
      rendererWantsClose = true;
    }
  };
  ipcMain.on(IPC_CHANNELS.beforeCloseRegister, onRegister);
  win.on("close", (event) => {
    if (
      closing ||
      !rendererWantsClose ||
      (SELFTEST && process.env.TUW_SELFTEST_CLOSE !== "1")
    ) {
      return;
    }
    event.preventDefault();
    closing = true;
    const finish = () => {
      clearTimeout(timer);
      ipcMain.removeListener(IPC_CHANNELS.beforeCloseDone, onDone);
      win.destroy();
    };
    const onDone = (e: Electron.IpcMainEvent) => {
      if (e.sender === win.webContents) {
        finish();
      }
    };
    // si la interfaz no responde en 4 s, se cierra igual
    const timer = setTimeout(finish, 4000);
    ipcMain.on(IPC_CHANNELS.beforeCloseDone, onDone);
    win.webContents.send(IPC_CHANNELS.beforeClose);
  });
  win.on("closed", () => {
    ipcMain.removeListener(IPC_CHANNELS.beforeCloseRegister, onRegister);
    mainWindow = null;
  });

  // La ventana solo navega dentro de la app.
  win.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url, DEV_URL)) {
      event.preventDefault();
    }
  });
  // Nada de ventanas nuevas: los links http(s) se abren en el navegador del sistema.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());

  void win.loadURL(DEV_URL ?? `${APP_ORIGIN}/`);
  return win;
};

/** Prueba automática: `TUW_SELFTEST=1 electron desktop` imprime un JSON y sale. */
const runSelfTest = (win: BrowserWindow) => {
  const consoleErrors: string[] = [];
  win.webContents.on("console-message", (...args: any[]) => {
    // Electron >= 35 entrega un único objeto `details`
    const d =
      args.length === 1 ? args[0] : { level: args[1], message: args[2] };
    const level = typeof d.level === "string" ? d.level : String(d.level);
    if (level === "error" || level === "3") {
      consoleErrors.push(String(d.message));
    }
  });
  win.webContents.once("did-finish-load", () => {
    setTimeout(async () => {
      try {
        const probe = await win.webContents.executeJavaScript(`(async () => ({
          title: document.title,
          hasRequire: typeof require !== "undefined",
          hasProcess: typeof process !== "undefined",
          hasIpcRenderer: typeof ipcRenderer !== "undefined",
          hasTuw: typeof window.tuw === "object",
          tuwKeys: window.tuw ? Object.keys(window.tuw) : [],
          appInfo: window.tuw ? await window.tuw.getAppInfo() : null,
          hasCanvas: !!document.querySelector("canvas"),
          fontFetch: await fetch("/fonts/Excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2").then((r) => [r.status, r.headers.get("content-type")]).catch((e) => String(e)),
          origin: location.origin,
          assetPath: window.EXCALIDRAW_ASSET_PATH,
          resourceHosts: [...new Set(performance.getEntriesByType("resource").map((r) => new URL(r.name).protocol + "//" + new URL(r.name).host))],
          lang: document.documentElement.lang,
          bodyText: document.body.innerText.slice(0, 200),
        }))()`);
        // Pegado REAL con Ctrl+V de una imagen del portapapeles (como un recorte de pantalla)
        if (process.env.TUW_SELFTEST_PASTE_PNG) {
          win.focus();
          win.webContents.focus();
          // imagen roja de 80x50 puesta en el portapapeles desde la propia página
          await win.webContents.executeJavaScript(`(async () => {
            const c = document.createElement("canvas");
            c.width = 80; c.height = 50;
            const g = c.getContext("2d");
            g.fillStyle = "#dc1e1e"; g.fillRect(0, 0, 80, 50);
            const blob = await new Promise((r) => c.toBlob(r, "image/png"));
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          })()`);
          await new Promise((r) => setTimeout(r, 300));
          for (const type of ["keyDown", "keyUp"] as const) {
            win.webContents.sendInputEvent({
              type,
              keyCode: "V",
              modifiers: ["control"],
            });
          }
          await new Promise((r) => setTimeout(r, 2000));
        }

        // Guion opcional que se ejecuta dentro de la ventana (clics, teclado, arrastrar…)
        let scriptResult: unknown = null;
        if (process.env.TUW_SELFTEST_SCRIPT) {
          try {
            scriptResult = await win.webContents.executeJavaScript(
              fs.readFileSync(process.env.TUW_SELFTEST_SCRIPT, "utf8"),
            );
          } catch (e: any) {
            scriptResult = { error: String(e) };
          }
        }

        // --- Prueba de punta a punta del guardado en disco (solo pruebas automáticas) ---
        const wsDir = process.env.TUW_WORKSPACE_DIR;
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
        const sheetState = () =>
          wsDir
            ? fs
                .readdirSync(wsDir)
                .filter((n) => n.endsWith(".excalidraw"))
                .map((n) => {
                  const full = path.join(wsDir, n);
                  const j = JSON.parse(fs.readFileSync(full, "utf8"));
                  return {
                    name: n,
                    mtimeMs: fs.statSync(full).mtimeMs,
                    elements: (j.elements || []).length,
                    types: (j.elements || []).map((e: any) => e.type),
                  };
                })
            : [];
        const before = sheetState();
        let after = before;
        if (process.env.TUW_SELFTEST_DRAW === "1") {
          const wc = win.webContents;
          wc.focus();
          for (const type of ["keyDown", "char", "keyUp"] as const) {
            wc.sendInputEvent({ type, keyCode: "r" } as any);
          }
          await sleep(300);
          wc.sendInputEvent({ type: "mouseMove", x: 400, y: 300 });
          wc.sendInputEvent({
            type: "mouseDown",
            x: 400,
            y: 300,
            button: "left",
            clickCount: 1,
          });
          for (let i = 1; i <= 10; i++) {
            wc.sendInputEvent({
              type: "mouseMove",
              x: 400 + i * 20,
              y: 300 + i * 15,
              button: "left",
            } as any);
            await sleep(30);
          }
          wc.sendInputEvent({
            type: "mouseUp",
            x: 600,
            y: 450,
            button: "left",
            clickCount: 1,
          });
        }
        if (process.env.TUW_SELFTEST_CLOSE === "1") {
          // cierra la ventana antes de que dispare el autosave: debe guardar igual
          await sleep(250);
          win.close();
          return;
        }
        await sleep(3500); // más que el retraso del autosave (1,5 s)
        after = sheetState();
        const workspace = { before, after };

        const shot = process.env.TUW_SELFTEST_SCREENSHOT;
        if (shot) {
          const img = await win.webContents.capturePage();
          fs.writeFileSync(shot, img.toPNG());
        }
        process.stdout.write(
          `TUW_SELFTEST_RESULT ${JSON.stringify({
            probe,
            consoleErrors,
            workspace,
            scriptResult,
          })}
`,
        );
      } catch (e: any) {
        process.stdout.write(
          `TUW_SELFTEST_RESULT ${JSON.stringify({ error: String(e) })}
`,
        );
      }
      app.exit(0);
    }, 4000);
  });
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.setName(APP_NAME);

  app.whenReady().then(async () => {
    hardenSession();
    if (!DEV_URL) {
      serveApp();
      Menu.setApplicationMenu(null);
    }

    ipcMain.handle(IPC_CHANNELS.appInfo, (event): TuwAppInfo => {
      if (!isTrustedSender(event.senderFrame?.url ?? "", DEV_URL)) {
        throw new Error("Origen no autorizado");
      }
      return {
        name: APP_NAME,
        version: app.getVersion(),
        platform: process.platform,
        isPackaged: app.isPackaged,
      };
    });

    registerWorkspaceIpc(() => mainWindow, DEV_URL);
    registerImageIpc(DEV_URL);
    registerExportIpc(() => mainWindow, DEV_URL);
    // En el primer arranque pregunta dónde guardar (Q14); antes de abrir la ventana.
    await ensureWorkspace(null, process.env.TUW_WORKSPACE_DIR);

    const win = createWindow();
    if (SELFTEST) {
      runSelfTest(win);
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
