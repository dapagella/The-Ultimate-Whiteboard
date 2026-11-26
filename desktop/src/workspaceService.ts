/**
 * Conecta el almacén del espacio de trabajo con la interfaz por IPC.
 * Solo corre en el proceso principal.
 */
import path from "node:path";

import { app, dialog, ipcMain } from "electron";

import { IPC_CHANNELS } from "./api";
import { isTrustedSender } from "./security";
import {
  WORKSPACE_FOLDER_NAME,
  readSettings,
  resolveWorkspaceRoot,
  writeSettings,
} from "./settings";
import { WorkspaceError, splitRelPath } from "./workspace/paths";
import {
  argContent,
  argString,
  argVersion,
  toResult,
} from "./workspace/result";
import { WorkspaceStore } from "./workspace/store";

import type { IpcMainInvokeEvent, BrowserWindow } from "electron";

import type { WorkspaceInfo } from "./workspace/types";

const settingsFile = () => path.join(app.getPath("userData"), "settings.json");

let store: WorkspaceStore | null = null;
let lastSheet: string | null = null;

const requireStore = (): WorkspaceStore => {
  if (!store) {
    throw new WorkspaceError(
      "NOT_FOUND",
      "El espacio de trabajo no está listo.",
    );
  }
  return store;
};

const info = (): WorkspaceInfo => ({
  root: requireStore().root,
  lastSheet,
});

const openStore = async (root: string) => {
  const s = new WorkspaceStore(root);
  await s.init();
  await s.purgeTrash().catch(() => {});
  store = s;
};

const defaultRoot = () =>
  path.join(app.getPath("documents"), WORKSPACE_FOLDER_NAME);

/** Diálogo para elegir carpeta. Devuelve la raíz resuelta o null si cancela. */
const pickRoot = async (win: BrowserWindow | null): Promise<string | null> => {
  const opts = {
    title: "Elegí dónde guardar tus carpetas y hojas",
    buttonLabel: "Usar esta carpeta",
    properties: ["openDirectory", "createDirectory"] as (
      | "openDirectory"
      | "createDirectory"
    )[],
  };
  const res = win
    ? await dialog.showOpenDialog(win, opts)
    : await dialog.showOpenDialog(opts);
  if (res.canceled || !res.filePaths[0]) {
    return null;
  }
  return resolveWorkspaceRoot(res.filePaths[0]);
};

/**
 * Deja el espacio de trabajo listo. En el PRIMER arranque pregunta dónde guardar
 * (Q14); si se cancela se usa Documentos/The Ultimate Whiteboard.
 */
export const ensureWorkspace = async (
  win: BrowserWindow | null,
  forceRoot?: string,
) => {
  const settings = await readSettings(settingsFile());
  // `forceRoot` solo lo usan las pruebas automáticas (sin diálogos)
  let root = forceRoot ?? settings.workspaceRoot;

  if (!root) {
    const msg = {
      type: "info" as const,
      title: "The Ultimate Whiteboard",
      message: "Elegí dónde guardar tus carpetas y hojas",
      detail:
        "Cada carpeta será una carpeta real y cada hoja un archivo .excalidraw, " +
        "así podés copiarlas o respaldarlas fácilmente. Podés cambiarlo más adelante.",
      buttons: ["Elegir carpeta…", `Usar Documentos`],
      defaultId: 0,
      cancelId: 1,
    };
    const answer = win
      ? await dialog.showMessageBox(win, msg)
      : await dialog.showMessageBox(msg);
    root =
      (answer.response === 0 ? await pickRoot(win) : null) ?? defaultRoot();
  }

  try {
    await openStore(root);
  } catch {
    // la carpeta guardada ya no se puede usar (disco desconectado, sin permisos…)
    root = defaultRoot();
    await openStore(root);
  }
  lastSheet =
    root === settings.workspaceRoot ? settings.lastSheet ?? null : null;
  await writeSettings(settingsFile(), { workspaceRoot: root, lastSheet });
};

export const registerWorkspaceIpc = (
  getWindow: () => BrowserWindow | null,
  devUrl: string | null,
) => {
  const ch = IPC_CHANNELS.ws;

  /** Registra un handler que (1) valida el origen y (2) devuelve `Result`. */
  const handle = <A extends unknown[]>(
    channel: string,
    fn: (...args: A) => Promise<unknown>,
  ) => {
    ipcMain.handle(
      channel,
      async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        if (!isTrustedSender(event.senderFrame?.url ?? "", devUrl)) {
          return {
            ok: false,
            error: {
              code: "INVALID_OPERATION",
              message: "Origen no autorizado.",
            },
          };
        }
        return toResult(() => fn(...(args as A)));
      },
    );
  };

  const persist = () =>
    writeSettings(settingsFile(), {
      workspaceRoot: requireStore().root,
      lastSheet,
    });

  handle(ch.getInfo, async () => info());

  handle(ch.chooseRoot, async () => {
    const root = await pickRoot(getWindow());
    if (!root) {
      return null;
    }
    await openStore(root);
    lastSheet = null;
    await persist();
    return info();
  });

  handle(ch.list, () => requireStore().list());
  handle(ch.createFolder, (parent, name) =>
    requireStore().createFolder(
      argString(parent, "parent"),
      argString(name, "name", 500),
    ),
  );
  handle(ch.createSheet, (parent, name) =>
    requireStore().createSheet(
      argString(parent, "parent"),
      argString(name, "name", 500),
    ),
  );
  handle(ch.rename, (p, name) =>
    requireStore().rename(argString(p, "path"), argString(name, "name", 500)),
  );
  handle(ch.move, (p, dest) =>
    requireStore().move(argString(p, "path"), argString(dest, "destFolder")),
  );
  handle(ch.duplicateSheet, (p) =>
    requireStore().duplicateSheet(argString(p, "path")),
  );
  handle(ch.readSheet, (p) => requireStore().readSheet(argString(p, "path")));
  handle(ch.writeSheet, (p, content, expected, force) =>
    requireStore().writeSheet(
      argString(p, "path"),
      argContent(content),
      argVersion(expected),
      { force: force === true },
    ),
  );
  handle(ch.trash, (p) => requireStore().trash(argString(p, "path")));
  handle(ch.listTrash, () => requireStore().listTrash());
  handle(ch.restoreTrash, (id) =>
    requireStore().restoreTrash(argString(id, "id", 100)),
  );
  handle(ch.deleteTrashForever, async (id) => {
    await requireStore().deleteTrashForever(argString(id, "id", 100));
    return null;
  });
  handle(ch.setLastSheet, async (p) => {
    if (p !== null) {
      splitRelPath(argString(p, "path"));
    }
    lastSheet = p as string | null;
    await persist();
    return null;
  });
};
