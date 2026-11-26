/**
 * Rutas y nombres seguros del espacio de trabajo. Lógica PURA (sin tocar el disco).
 *
 * Convención: las rutas que viajan entre la interfaz y el proceso principal son
 * RELATIVAS al espacio de trabajo, con "/" como separador (ej. "Mate/Álgebra/Ecuaciones.excalidraw").
 * La cadena vacía "" es la raíz.
 */
import path from "node:path";

export type WorkspaceErrorCode =
  | "INVALID_NAME"
  | "INVALID_PATH"
  | "OUTSIDE_WORKSPACE"
  | "NOT_FOUND"
  | "EXISTS"
  | "CONFLICT"
  | "INVALID_OPERATION"
  | "IO_ERROR";

export class WorkspaceError extends Error {
  readonly code: WorkspaceErrorCode;
  constructor(code: WorkspaceErrorCode, message: string) {
    super(message);
    this.name = "WorkspaceError";
    this.code = code;
  }
}

export const SHEET_EXT = ".excalidraw";
/** Carpeta interna (papelera, backups, ajustes). Nunca es visible para el usuario. */
export const INTERNAL_DIR = ".tuw";

export const MAX_NAME_LENGTH = 120;

// eslint-disable-next-line no-control-regex
const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Valida el nombre de UNA carpeta u hoja (sin extensión) para crearla o renombrarla. */
export const validateName = (
  name: string,
): { ok: true; name: string } | { ok: false; error: string } => {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) {
    return { ok: false, error: "El nombre no puede estar vacío." };
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      error: `El nombre no puede superar ${MAX_NAME_LENGTH} caracteres.`,
    };
  }
  if (INVALID_CHARS.test(trimmed)) {
    return {
      ok: false,
      error: 'El nombre no puede contener / \\ : * ? " < > |',
    };
  }
  if (trimmed.startsWith(".")) {
    return { ok: false, error: "El nombre no puede empezar con un punto." };
  }
  if (trimmed.endsWith(".")) {
    return { ok: false, error: "El nombre no puede terminar con un punto." };
  }
  // "CON", "NUL.txt", etc.: reservados en Windows aunque lleven extensión
  if (RESERVED_WINDOWS.test(trimmed.split(".")[0])) {
    return { ok: false, error: `"${trimmed}" es un nombre reservado.` };
  }
  return { ok: true, name: trimmed };
};

/** Como `validateName` pero lanza WorkspaceError. */
export const assertValidName = (name: string): string => {
  const res = validateName(name);
  if (!res.ok) {
    throw new WorkspaceError("INVALID_NAME", res.error);
  }
  return res.name;
};

/**
 * Parte una ruta relativa ("a/b/c") en segmentos validando que no haya
 * absolutas, unidades de disco, "..", ".", segmentos vacíos ni la carpeta interna.
 */
export const splitRelPath = (
  rel: string,
  opts: { allowInternal?: boolean } = {},
): string[] => {
  if (typeof rel !== "string") {
    throw new WorkspaceError("INVALID_PATH", "Ruta inválida.");
  }
  if (rel === "") {
    return [];
  }
  if (
    rel.includes("\0") ||
    rel.includes("\\") ||
    rel.startsWith("/") ||
    /^[a-zA-Z]:/.test(rel)
  ) {
    throw new WorkspaceError("INVALID_PATH", "Ruta inválida.");
  }
  const segments = rel.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") {
      throw new WorkspaceError("INVALID_PATH", "Ruta inválida.");
    }
    if (!opts.allowInternal && seg.toLowerCase() === INTERNAL_DIR) {
      throw new WorkspaceError("INVALID_PATH", "Ruta inválida.");
    }
  }
  return segments;
};

/** Ruta relativa → ruta absoluta DENTRO de `root`. Lanza si intenta salir. */
export const resolveInWorkspace = (
  root: string,
  rel: string,
  opts: { allowInternal?: boolean } = {},
): string => {
  const segments = splitRelPath(rel, opts);
  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, ...segments);
  if (abs !== absRoot && !abs.startsWith(absRoot + path.sep)) {
    throw new WorkspaceError(
      "OUTSIDE_WORKSPACE",
      "La ruta está fuera del espacio de trabajo.",
    );
  }
  return abs;
};

/** Une segmentos en una ruta relativa con "/". */
export const joinRel = (...parts: string[]): string =>
  parts.filter((p) => p !== "").join("/");

export const parentRel = (rel: string): string => {
  const segs = splitRelPath(rel);
  return segs.slice(0, -1).join("/");
};

export const baseName = (rel: string): string => {
  const segs = splitRelPath(rel);
  return segs[segs.length - 1] ?? "";
};

export const isSheetFile = (fileName: string): boolean =>
  fileName.toLowerCase().endsWith(SHEET_EXT);

/** Nombre visible de una hoja (sin la extensión). */
export const sheetDisplayName = (fileName: string): string =>
  isSheetFile(fileName) ? fileName.slice(0, -SHEET_EXT.length) : fileName;

/** ¿`child` es `ancestor` o está dentro de él? (rutas relativas) */
export const isSameOrInside = (ancestor: string, child: string): boolean =>
  child === ancestor || child.startsWith(`${ancestor}/`);

/**
 * Devuelve un nombre que no choque con `existing` (comparación sin distinguir
 * mayúsculas, como en Windows): "Hoja", "Hoja (2)", "Hoja (3)"…
 */
export const uniqueName = (
  existing: Iterable<string>,
  base: string,
  ext = "",
): string => {
  const taken = new Set([...existing].map((n) => n.toLowerCase()));
  if (!taken.has((base + ext).toLowerCase())) {
    return base + ext;
  }
  for (let i = 2; i < 10000; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  throw new WorkspaceError("EXISTS", "No se pudo generar un nombre único.");
};
