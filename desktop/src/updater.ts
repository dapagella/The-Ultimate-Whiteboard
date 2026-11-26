/**
 * Auto-actualización desde los Releases PÚBLICOS de GitHub (Q16): no lleva ningún token.
 * Busca al iniciar, descarga en segundo plano y aplica al cerrar la app (o con "Reiniciar e instalar").
 */
import { app, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";

import { IPC_CHANNELS } from "./api";
import { isTrustedSender } from "./security";
import {
  INITIAL_STATUS,
  UNSUPPORTED_STATUS,
  reduceUpdate,
} from "./updateState";

import type { UpdateEvent, UpdateStatus } from "./updateState";

const STARTUP_DELAY_MS = 15_000;

let status: UpdateStatus = INITIAL_STATUS;
let wired = false;

const dispatch = (event: UpdateEvent) => {
  status = reduceUpdate(status, event);
};

/** Las actualizaciones solo existen en la app instalada (no en desarrollo ni en las pruebas). */
const supported = (devUrl: string | null) =>
  app.isPackaged && !devUrl && process.env.TUW_SELFTEST !== "1";

const wire = () => {
  if (wired) {
    return;
  }
  wired = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = null;
  autoUpdater.on("checking-for-update", () => dispatch({ type: "check" }));
  autoUpdater.on("update-available", (i) =>
    dispatch({ type: "available", version: i.version }),
  );
  autoUpdater.on("update-not-available", () =>
    dispatch({ type: "not-available" }),
  );
  autoUpdater.on("download-progress", (p) =>
    dispatch({ type: "progress", percent: p.percent }),
  );
  autoUpdater.on("update-downloaded", (i) =>
    dispatch({ type: "downloaded", version: i.version }),
  );
  autoUpdater.on("error", (e) =>
    dispatch({ type: "error", message: String(e?.message ?? e) }),
  );
};

const check = async () => {
  if (status.state === "checking" || status.state === "downloading") {
    return;
  }
  dispatch({ type: "check" });
  try {
    await autoUpdater.checkForUpdates();
  } catch (e: any) {
    dispatch({ type: "error", message: String(e?.message ?? e) });
  }
};

export const registerUpdaterIpc = (devUrl: string | null) => {
  const ok = supported(devUrl);
  if (!ok) {
    status = UNSUPPORTED_STATUS;
  } else {
    wire();
    setTimeout(() => void check(), STARTUP_DELAY_MS);
  }

  const guard = (event: Electron.IpcMainInvokeEvent) =>
    isTrustedSender(event.senderFrame?.url ?? "", devUrl);

  ipcMain.handle(IPC_CHANNELS.updater.status, (event) => {
    if (!guard(event)) {
      throw new Error("Origen no autorizado");
    }
    return status;
  });
  ipcMain.handle(IPC_CHANNELS.updater.check, async (event) => {
    if (!guard(event)) {
      throw new Error("Origen no autorizado");
    }
    if (ok) {
      await check();
    }
    return status;
  });
  ipcMain.handle(IPC_CHANNELS.updater.install, (event) => {
    if (!guard(event)) {
      throw new Error("Origen no autorizado");
    }
    if (ok && status.state === "ready") {
      // cierra, instala y vuelve a abrir
      setImmediate(() => autoUpdater.quitAndInstall(false, true));
    }
  });
};
