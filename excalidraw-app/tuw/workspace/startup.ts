import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";

import { InvalidSceneError, parseScene, serializeScene } from "./sceneFile";

import type {
  Result,
  SheetVersion,
  TreeNode,
  TuwWorkspaceApi,
} from "../../../desktop/src/api";

import type { SheetSession } from "./sheetSession";

type StartupIO = Pick<
  TuwWorkspaceApi,
  "getInfo" | "list" | "readSheet" | "createSheet"
>;

/**
 * Texto que se guardaría si la escena no se modifica. Sirve de referencia para NO
 * reescribir el archivo al abrirlo (solo por diferencias de formato).
 */
const baselineOf = (scene: ExcalidrawInitialDataState) =>
  serializeScene(scene.elements ?? [], scene.appState ?? {}, scene.files ?? {});

const unwrapOrNull = <T>(r: Result<T>): T | null => (r.ok ? r.value : null);

const firstSheetPaths = (nodes: TreeNode[]): string[] => {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.type === "sheet") {
      out.push(n.path);
    } else {
      out.push(...firstSheetPaths(n.children));
    }
  }
  return out;
};

/**
 * Decide qué hoja abrir al iniciar: la última usada; si no existe o está
 * dañada, la primera válida del espacio de trabajo; si no hay ninguna, crea
 * "Hoja 1". Un archivo dañado NUNCA se sobrescribe.
 */
export const loadInitialSheet = async (
  io: StartupIO,
  session: SheetSession,
): Promise<{ path: string; scene: ExcalidrawInitialDataState }> => {
  const info = unwrapOrNull(await io.getInfo());

  const tryOpen = async (path: string) => {
    const read = unwrapOrNull(await io.readSheet(path));
    if (!read) {
      return null;
    }
    try {
      const scene = parseScene(read.content);
      session.open(path, read.content, read.version, baselineOf(scene));
      return { path, scene };
    } catch (e) {
      if (e instanceof InvalidSceneError) {
        return null; // dañada: se deja como está
      }
      throw e;
    }
  };

  if (info?.lastSheet) {
    const opened = await tryOpen(info.lastSheet);
    if (opened) {
      return opened;
    }
  }

  const tree = unwrapOrNull(await io.list()) ?? [];
  for (const path of firstSheetPaths(tree)) {
    if (path === info?.lastSheet) {
      continue;
    }
    const opened = await tryOpen(path);
    if (opened) {
      return opened;
    }
  }

  const created = await io.createSheet("", "Hoja 1");
  if (!created.ok) {
    throw new Error(created.error.message);
  }
  const read = await io.readSheet(created.value.path);
  if (!read.ok) {
    throw new Error(read.error.message);
  }
  const scene = parseScene(read.value.content);
  session.open(
    created.value.path,
    read.value.content,
    read.value.version as SheetVersion,
    baselineOf(scene),
  );
  return { path: created.value.path, scene };
};
