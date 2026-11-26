/**
 * Estado de la auto-actualización (lógica PURA, sin Electron: se prueba con vitest).
 * La app consulta los Releases públicos de GitHub, descarga en segundo plano y aplica la
 * actualización al cerrar y volver a abrir (o con "Reiniciar e instalar").
 */

export type UpdateState =
  | "unsupported" // desarrollo o versión sin instalar
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "up-to-date"
  | "error";

export type UpdateStatus = {
  state: UpdateState;
  /** Versión nueva (cuando hay una). */
  version?: string;
  /** Porcentaje de descarga (0-100). */
  percent?: number;
  message?: string;
};

export type UpdateEvent =
  | { type: "check" }
  | { type: "available"; version: string }
  | { type: "not-available" }
  | { type: "progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string };

export const INITIAL_STATUS: UpdateStatus = { state: "idle" };
export const UNSUPPORTED_STATUS: UpdateStatus = {
  state: "unsupported",
  message: "Las actualizaciones solo funcionan en la versión instalada.",
};

/** Mensaje en castellano para la persona (sin rutas ni textos técnicos largos). */
export const friendlyError = (raw: unknown): string => {
  const text = String((raw as any)?.message ?? raw ?? "");
  if (
    /net::|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|EAI_AGAIN|network/i.test(
      text,
    )
  ) {
    return "No se pudo conectar para buscar actualizaciones. Revisá tu conexión a internet.";
  }
  if (/404|latest\.yml|Cannot find/i.test(text)) {
    return "Todavía no hay una versión publicada para descargar.";
  }
  if (/403|rate limit/i.test(text)) {
    return "GitHub limitó las consultas por ahora. Probá de nuevo en un rato.";
  }
  return "No se pudo buscar actualizaciones. Probá de nuevo más tarde.";
};

export const reduceUpdate = (
  status: UpdateStatus,
  event: UpdateEvent,
): UpdateStatus => {
  if (status.state === "unsupported") {
    return status;
  }
  // una actualización ya descargada no se pisa con una nueva búsqueda
  if (status.state === "ready" && event.type !== "downloaded") {
    return status;
  }
  switch (event.type) {
    case "check":
      return { state: "checking" };
    case "available":
      return { state: "downloading", version: event.version, percent: 0 };
    case "not-available":
      return { state: "up-to-date" };
    case "progress":
      return {
        state: "downloading",
        version: status.version,
        percent: Math.max(0, Math.min(100, Math.round(event.percent))),
      };
    case "downloaded":
      return { state: "ready", version: event.version };
    case "error":
      return { state: "error", message: friendlyError(event.message) };
  }
};
