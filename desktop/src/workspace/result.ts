import { WorkspaceError } from "./paths";

import type { Result } from "./types";

/** Ejecuta `fn` y devuelve `{ok, value}` o `{ok:false, error}` (los errores viajan como datos por IPC). */
export const toResult = async <T>(fn: () => Promise<T>): Promise<Result<T>> => {
  try {
    return { ok: true, value: await fn() };
  } catch (e: any) {
    if (e instanceof WorkspaceError) {
      return { ok: false, error: { code: e.code, message: e.message } };
    }
    // errores del sistema de archivos: se traducen sin exponer rutas completas
    const code = typeof e?.code === "string" ? e.code : "";
    const message =
      code === "EPERM" || code === "EACCES"
        ? "Sin permiso para acceder al archivo o la carpeta."
        : code === "EBUSY"
        ? "El archivo está en uso por otro programa."
        : code === "ENOSPC"
        ? "No hay espacio suficiente en el disco."
        : "No se pudo completar la operación.";
    return { ok: false, error: { code: "IO_ERROR", message } };
  }
};

/** Validadores de argumentos que llegan por IPC (la interfaz no es de confianza). */
export const argString = (v: unknown, name: string, maxLen = 4096): string => {
  if (typeof v !== "string" || v.length > maxLen) {
    throw new WorkspaceError("INVALID_PATH", `Argumento inválido: ${name}.`);
  }
  return v;
};

/** Contenido de una hoja: hasta 256 MB. */
export const argContent = (v: unknown): string => {
  if (typeof v !== "string" || v.length > 256 * 1024 * 1024) {
    throw new WorkspaceError("INVALID_OPERATION", "Contenido inválido.");
  }
  return v;
};

export const argVersion = (
  v: unknown,
): { mtimeMs: number; size: number; hash: string } | null => {
  if (v === null || v === undefined) {
    return null;
  }
  const o = v as any;
  if (
    typeof o !== "object" ||
    typeof o.mtimeMs !== "number" ||
    typeof o.size !== "number" ||
    typeof o.hash !== "string" ||
    !/^[a-f0-9]{64}$/.test(o.hash)
  ) {
    throw new WorkspaceError("INVALID_OPERATION", "Versión inválida.");
  }
  return { mtimeMs: o.mtimeMs, size: o.size, hash: o.hash };
};
