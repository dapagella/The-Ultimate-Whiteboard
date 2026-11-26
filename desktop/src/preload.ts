import { contextBridge, ipcRenderer } from "electron";

import { IPC_CHANNELS } from "./api";

import type { TuwApi } from "./api";

const ch = IPC_CHANNELS.ws;
const call =
  (channel: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args);

const api: TuwApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appInfo),
  workspace: {
    getInfo: call(ch.getInfo) as TuwApi["workspace"]["getInfo"],
    chooseRoot: call(ch.chooseRoot) as TuwApi["workspace"]["chooseRoot"],
    list: call(ch.list) as TuwApi["workspace"]["list"],
    createFolder: call(ch.createFolder) as TuwApi["workspace"]["createFolder"],
    createSheet: call(ch.createSheet) as TuwApi["workspace"]["createSheet"],
    rename: call(ch.rename) as TuwApi["workspace"]["rename"],
    move: call(ch.move) as TuwApi["workspace"]["move"],
    duplicateSheet: call(
      ch.duplicateSheet,
    ) as TuwApi["workspace"]["duplicateSheet"],
    readSheet: call(ch.readSheet) as TuwApi["workspace"]["readSheet"],
    writeSheet: call(ch.writeSheet) as TuwApi["workspace"]["writeSheet"],
    trash: call(ch.trash) as TuwApi["workspace"]["trash"],
    listTrash: call(ch.listTrash) as TuwApi["workspace"]["listTrash"],
    restoreTrash: call(ch.restoreTrash) as TuwApi["workspace"]["restoreTrash"],
    deleteTrashForever: call(
      ch.deleteTrashForever,
    ) as TuwApi["workspace"]["deleteTrashForever"],
    setLastSheet: call(ch.setLastSheet) as TuwApi["workspace"]["setLastSheet"],
  },
  onBeforeClose: (cb) => {
    ipcRenderer.send(IPC_CHANNELS.beforeCloseRegister);
    const handler = async () => {
      try {
        await cb();
      } finally {
        ipcRenderer.send(IPC_CHANNELS.beforeCloseDone);
      }
    };
    ipcRenderer.on(IPC_CHANNELS.beforeClose, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.beforeClose, handler);
    };
  },
};

contextBridge.exposeInMainWorld("tuw", api);
