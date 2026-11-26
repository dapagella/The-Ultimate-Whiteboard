/**
 * Tipos compartidos entre el proceso principal y la interfaz.
 * IMPORTANTE: este archivo no debe importar nada (la interfaz no tiene tipos de Node).
 */
export type SheetVersion = { mtimeMs: number; size: number; hash: string };

export type TreeNode =
  | { type: "folder"; name: string; path: string; children: TreeNode[] }
  | {
      type: "sheet";
      name: string;
      path: string;
      mtimeMs: number;
      size: number;
    };

export type TrashEntry = {
  id: string;
  type: "folder" | "sheet";
  /** Nombre visible (hoja sin extensión). */
  name: string;
  originalPath: string;
  deletedAt: number;
};

export type WriteResult =
  | { ok: true; version: SheetVersion }
  | { ok: false; conflict: true; current: SheetVersion };

/** Resultado de toda operación del espacio de trabajo (los errores viajan como datos). */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

/** Imagen descargada por URL (ya validada por sus bytes). */
export type FetchedImage = {
  mimeType: string;
  base64: string;
  bytes: number;
  name: string;
};

export type WorkspaceInfo = { root: string; lastSheet: string | null };
