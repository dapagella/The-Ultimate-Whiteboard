/**
 * TUW — Trazo activo del lápiz (presets tipo Impress: lápiz, lapicera, fibra, resaltador).
 * Se aplica a los trazos NUEVOS; no se guarda en el archivo de la hoja (cada trazo guarda lo suyo).
 */
export type TuwStroke = {
  /** Id del preset elegido (null = ninguno). */
  preset: string | null;
  /** Grosor propio del preset (escala de trazo libre); null = el de la barra de propiedades. */
  strokeWidth: number | null;
  /** `multiply` = se mezcla con lo de abajo (resaltador). */
  blendMode: "normal" | "multiply";
};

export const DEFAULT_TUW_STROKE: TuwStroke = {
  preset: null,
  strokeWidth: null,
  blendMode: "normal",
};

export const MIN_TUW_STROKE_WIDTH = 0.2;
export const MAX_TUW_STROKE_WIDTH = 30;

export const normalizeTuwStroke = (value: unknown): TuwStroke => {
  const v = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
  const w = typeof v.strokeWidth === "number" ? v.strokeWidth : NaN;
  return {
    preset:
      typeof v.preset === "string" && v.preset.length <= 64 ? v.preset : null,
    strokeWidth: Number.isFinite(w)
      ? Math.min(MAX_TUW_STROKE_WIDTH, Math.max(MIN_TUW_STROKE_WIDTH, w))
      : null,
    blendMode: v.blendMode === "multiply" ? "multiply" : "normal",
  };
};
