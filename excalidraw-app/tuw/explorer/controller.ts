/**
 * Acciones del explorador. Coordina el espacio de trabajo (disco), la sesión de
 * guardado y el editor. Todo se inyecta para poder probarlo sin Electron ni React.
 */
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";

import { applyDefaultStyle } from "../background/defaults";
import { parseScene, serializeScene } from "../workspace/sceneFile";

import { topLevelOnly, validateMove, buildIndex } from "./tree";

import type {
  Result,
  SheetVersion,
  TrashEntry,
  TreeNode,
} from "../../../desktop/src/api";
import type { DefaultSheetStyle } from "../background/defaults";
import type { SheetSession } from "../workspace/sheetSession";

export class ExplorerError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ExplorerError";
    this.code = code;
  }
}

const unwrap = <T>(r: Result<T>): T => {
  if (!r.ok) {
    throw new ExplorerError(r.error.code, r.error.message);
  }
  return r.value;
};

export type ExplorerWorkspace = {
  list: () => Promise<Result<TreeNode[]>>;
  createFolder: (parent: string, name: string) => Promise<Result<string>>;
  createSheet: (
    parent: string,
    name: string,
  ) => Promise<Result<{ path: string; version: SheetVersion }>>;
  rename: (path: string, newName: string) => Promise<Result<string>>;
  move: (path: string, dest: string) => Promise<Result<string>>;
  duplicateSheet: (
    path: string,
  ) => Promise<Result<{ path: string; version: SheetVersion }>>;
  readSheet: (
    path: string,
  ) => Promise<Result<{ content: string; version: SheetVersion }>>;
  trash: (path: string) => Promise<Result<TrashEntry>>;
  listTrash: () => Promise<Result<TrashEntry[]>>;
  restoreTrash: (id: string) => Promise<Result<string>>;
  deleteTrashForever: (id: string) => Promise<Result<null>>;
};

export type ExplorerSession = Pick<
  SheetSession,
  | "open"
  | "flush"
  | "withPaused"
  | "remapPath"
  | "isActiveWithin"
  | "detach"
  | "currentPath"
>;

export type EditorBridge = {
  /** Reemplaza lo que muestra el editor por la escena dada (sin historial de deshacer). */
  replaceScene: (scene: ExcalidrawInitialDataState) => void;
};

export type ExplorerDeps = {
  ws: ExplorerWorkspace;
  session: ExplorerSession;
  editor: EditorBridge;
  /** Estilo (fondo) por defecto de las hojas nuevas (Q9). */
  defaultStyle?: () => DefaultSheetStyle | null;
};

const baselineOf = (scene: ExcalidrawInitialDataState) =>
  serializeScene(scene.elements ?? [], scene.appState ?? {}, scene.files ?? {});

/**
 * Abre una hoja en el editor (guardando antes lo pendiente de la actual).
 * Con `isNew`, a la hoja recién creada se le aplica el estilo por defecto.
 */
export const openSheet = async (
  deps: ExplorerDeps,
  path: string,
  opts: { isNew?: boolean } = {},
) => {
  const { ws, session, editor } = deps;
  if (session.currentPath === path) {
    return;
  }
  await session.flush();
  const read = unwrap(await ws.readSheet(path));
  // si el archivo está dañado, parseScene lanza y la hoja actual queda como estaba
  const scene = parseScene(read.content);
  // la referencia es la hoja SIN el estilo por defecto: así el primer guardado lo escribe en el archivo
  session.open(path, read.content, read.version, baselineOf(scene));
  editor.replaceScene(
    opts.isNew
      ? applyDefaultStyle(scene, deps.defaultStyle?.() ?? null)
      : scene,
  );
};

/** Abre la primera hoja que haya, o crea "Hoja 1" si el espacio de trabajo quedó vacío. */
const openFallback = async (deps: ExplorerDeps) => {
  const tree = unwrap(await deps.ws.list());
  const firstSheet = [...buildIndex(tree).values()].find(
    (n) => n.type === "sheet",
  );
  if (firstSheet) {
    try {
      await openSheet(deps, firstSheet.path);
      return;
    } catch {
      // dañada: se sigue con una hoja nueva
    }
  }
  const created = unwrap(await deps.ws.createSheet("", "Hoja 1"));
  await openSheet(deps, created.path, { isNew: true });
};

export const createSheet = async (
  deps: ExplorerDeps,
  parent: string,
  name: string,
): Promise<string> => {
  await deps.session.flush();
  const created = unwrap(await deps.ws.createSheet(parent, name));
  await openSheet(deps, created.path, { isNew: true });
  return created.path;
};

export const createFolder = async (
  deps: ExplorerDeps,
  parent: string,
  name: string,
): Promise<string> => unwrap(await deps.ws.createFolder(parent, name));

export const renameItem = async (
  deps: ExplorerDeps,
  path: string,
  newName: string,
): Promise<string> =>
  deps.session.withPaused(async () => {
    const newPath = unwrap(await deps.ws.rename(path, newName));
    deps.session.remapPath(path, newPath);
    return newPath;
  });

export type MoveOutcome = { moved: { from: string; to: string }[] };

/** Mueve varios elementos a una carpeta ("" = raíz). Rechaza ciclos antes de tocar el disco. */
export const moveItems = async (
  deps: ExplorerDeps,
  paths: string[],
  dest: string,
): Promise<MoveOutcome> => {
  const tree = unwrap(await deps.ws.list());
  const check = validateMove(paths, dest, buildIndex(tree));
  if (!check.ok) {
    throw new ExplorerError("INVALID_OPERATION", check.reason);
  }
  return deps.session.withPaused(async () => {
    const moved: MoveOutcome["moved"] = [];
    for (const from of check.movable) {
      const to = unwrap(await deps.ws.move(from, dest));
      deps.session.remapPath(from, to);
      moved.push({ from, to });
    }
    return { moved };
  });
};

/** Manda a la papelera (15 días). Si se borra la hoja abierta, abre otra. */
export const trashItems = async (
  deps: ExplorerDeps,
  paths: string[],
): Promise<TrashEntry[]> => {
  const top = topLevelOnly(paths);
  let activeAffected = false;
  const entries = await deps.session.withPaused(async () => {
    const out: TrashEntry[] = [];
    for (const p of top) {
      if (deps.session.isActiveWithin(p)) {
        activeAffected = true;
        // lo pendiente ya se guardó en withPaused; no debe volver a escribirse a la ruta vieja
        deps.session.detach();
      }
      out.push(unwrap(await deps.ws.trash(p)));
    }
    return out;
  });
  if (activeAffected) {
    await openFallback(deps);
  }
  return entries;
};

export const duplicateSheet = async (
  deps: ExplorerDeps,
  path: string,
): Promise<string> => {
  await deps.session.flush(); // la copia debe incluir lo último que se dibujó
  return unwrap(await deps.ws.duplicateSheet(path)).path;
};

export const restoreFromTrash = async (
  deps: ExplorerDeps,
  id: string,
): Promise<string> => unwrap(await deps.ws.restoreTrash(id));

export const deleteFromTrash = async (
  deps: ExplorerDeps,
  id: string,
): Promise<void> => {
  unwrap(await deps.ws.deleteTrashForever(id));
};
