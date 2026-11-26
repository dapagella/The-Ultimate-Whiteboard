/**
 * API que el proceso principal expone a la interfaz (vía preload) como `window.tuw`.
 * Es una lista CERRADA de operaciones: la interfaz nunca recibe Node ni `ipcRenderer`.
 * Todas las rutas son relativas al espacio de trabajo ("" = raíz, "/" como separador).
 */
import type {
  ExportRequest,
  ExportResult,
  FetchedImage,
  Result,
  SheetVersion,
  TrashEntry,
  TreeNode,
  WorkspaceInfo,
  WriteResult,
} from "./workspace/types";

export type {
  ExportRequest,
  ExportResult,
  FetchedImage,
  Result,
  SheetVersion,
  TrashEntry,
  TreeNode,
  WorkspaceInfo,
  WriteResult,
};

export type TuwAppInfo = {
  name: string;
  version: string;
  platform: string;
  isPackaged: boolean;
};

export type TuwWorkspaceApi = {
  getInfo: () => Promise<Result<WorkspaceInfo>>;
  /** Abre el diálogo para elegir otra carpeta de trabajo. `null` si cancela. */
  chooseRoot: () => Promise<Result<WorkspaceInfo | null>>;
  list: () => Promise<Result<TreeNode[]>>;
  createFolder: (parent: string, name: string) => Promise<Result<string>>;
  createSheet: (
    parent: string,
    name: string,
  ) => Promise<Result<{ path: string; version: SheetVersion }>>;
  rename: (path: string, newName: string) => Promise<Result<string>>;
  move: (path: string, destFolder: string) => Promise<Result<string>>;
  duplicateSheet: (
    path: string,
  ) => Promise<Result<{ path: string; version: SheetVersion }>>;
  readSheet: (
    path: string,
  ) => Promise<Result<{ content: string; version: SheetVersion }>>;
  writeSheet: (
    path: string,
    content: string,
    expected: SheetVersion | null,
    force?: boolean,
  ) => Promise<Result<WriteResult>>;
  trash: (path: string) => Promise<Result<TrashEntry>>;
  listTrash: () => Promise<Result<TrashEntry[]>>;
  restoreTrash: (id: string) => Promise<Result<string>>;
  deleteTrashForever: (id: string) => Promise<Result<null>>;
  setLastSheet: (path: string | null) => Promise<Result<null>>;
};

export type TuwApi = {
  getAppInfo: () => Promise<TuwAppInfo>;
  workspace: TuwWorkspaceApi;
  /** Descarga una imagen por URL (en el proceso principal, sin límites de CORS). */
  fetchImage: (url: string) => Promise<Result<FetchedImage>>;
  /** Guarda un archivo exportado con el diálogo nativo de guardado (la persona elige dónde). */
  saveExport: (req: ExportRequest) => Promise<Result<ExportResult>>;
  /**
   * Registra una función que la app ejecuta antes de cerrar la ventana
   * (para guardar lo pendiente). Devuelve cómo des-registrarla.
   */
  onBeforeClose: (cb: () => Promise<void> | void) => () => void;
};

export const IPC_CHANNELS = {
  appInfo: "tuw:app-info",
  ws: {
    getInfo: "tuw:ws:get-info",
    chooseRoot: "tuw:ws:choose-root",
    list: "tuw:ws:list",
    createFolder: "tuw:ws:create-folder",
    createSheet: "tuw:ws:create-sheet",
    rename: "tuw:ws:rename",
    move: "tuw:ws:move",
    duplicateSheet: "tuw:ws:duplicate-sheet",
    readSheet: "tuw:ws:read-sheet",
    writeSheet: "tuw:ws:write-sheet",
    trash: "tuw:ws:trash",
    listTrash: "tuw:ws:list-trash",
    restoreTrash: "tuw:ws:restore-trash",
    deleteTrashForever: "tuw:ws:delete-trash-forever",
    setLastSheet: "tuw:ws:set-last-sheet",
  },
  fetchImage: "tuw:fetch-image",
  saveExport: "tuw:save-export",
  beforeClose: "tuw:before-close",
  beforeCloseRegister: "tuw:before-close-register",
  beforeCloseDone: "tuw:before-close-done",
} as const;
