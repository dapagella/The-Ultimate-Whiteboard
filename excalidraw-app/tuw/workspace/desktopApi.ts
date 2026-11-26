import type { Result, TuwApi } from "../../../desktop/src/api";

/** `window.tuw` existe solo dentro de la app de escritorio (lo inyecta el preload). */
export const getTuw = (): TuwApi | null =>
  (typeof window !== "undefined" && (window as any).tuw) || null;

export const isDesktop = (): boolean => getTuw() !== null;

export class WorkspaceClientError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "WorkspaceClientError";
    this.code = code;
  }
}

/** Convierte `{ok:false}` en una excepción con `.code`. */
export const unwrap = async <T>(promise: Promise<Result<T>>): Promise<T> => {
  const res = await promise;
  if (!res.ok) {
    throw new WorkspaceClientError(res.error.code, res.error.message);
  }
  return res.value;
};
