/**
 * Geometría de los ejes 2D y 3D. Lógica PURA (sin React ni elementos de Excalidraw).
 * Coordenadas de pantalla: x crece a la derecha, y crece HACIA ABAJO.
 * Todo es relativo al origen del eje.
 */

export type Vec = { x: number; y: number };
export type AxisRole = "x" | "y" | "z";
export type AxisDim = 2 | 3;

export type AxisParams = {
  lengthX: number;
  lengthY: number;
  /** Solo en 3D. */
  lengthZ?: number;
  /** Solo en 3D: ángulo del eje Z en grados, medido desde +x en sentido antihorario (como en matemática). */
  angleZDeg?: number;
};

/** El eje Z va "hacia abajo a la izquierda": entre 180° (horizontal, a la izquierda) y 270° (vertical, hacia abajo). */
export const MIN_Z_ANGLE = 180;
export const MAX_Z_ANGLE = 270;
export const DEFAULT_Z_ANGLE = 225;
export const MIN_AXIS_LENGTH = 20;
export const MAX_AXIS_LENGTH = 5000;
export const DEFAULT_AXIS_LENGTH = 220;
/** Proporción por defecto de Z respecto de X (acortado por la perspectiva). */
export const DEFAULT_Z_RATIO = 0.62;

export const DEFAULT_LABELS: Record<AxisRole, string> = {
  x: "x",
  y: "y",
  z: "z",
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

export const clampZAngle = (deg: number): number =>
  Number.isFinite(deg) ? clamp(deg, MIN_Z_ANGLE, MAX_Z_ANGLE) : DEFAULT_Z_ANGLE;

export const clampLength = (
  len: number,
  fallback = DEFAULT_AXIS_LENGTH,
): number =>
  Number.isFinite(len)
    ? clamp(len, MIN_AXIS_LENGTH, MAX_AXIS_LENGTH)
    : fallback;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Parámetros válidos y completos para la dimensión pedida. */
export const normalizeParams = (
  dim: AxisDim,
  p: Partial<AxisParams>,
): AxisParams => {
  const lengthX = clampLength(p.lengthX ?? DEFAULT_AXIS_LENGTH);
  const base: AxisParams = {
    lengthX,
    lengthY: clampLength(p.lengthY ?? DEFAULT_AXIS_LENGTH),
  };
  if (dim === 2) {
    return base;
  }
  return {
    ...base,
    lengthZ: clampLength(p.lengthZ ?? lengthX * DEFAULT_Z_RATIO),
    angleZDeg: clampZAngle(p.angleZDeg ?? DEFAULT_Z_ANGLE),
  };
};

/** Extremo (relativo al origen) de cada flecha. */
export const axisTips = (
  dim: AxisDim,
  params: AxisParams,
): Partial<Record<AxisRole, Vec>> => {
  const p = normalizeParams(dim, params);
  const tips: Partial<Record<AxisRole, Vec>> = {
    x: { x: p.lengthX, y: 0 },
    y: { x: 0, y: -p.lengthY },
  };
  if (dim === 3) {
    const a = rad(p.angleZDeg!);
    // en pantalla la y va hacia abajo, por eso el seno cambia de signo
    tips.z = { x: Math.cos(a) * p.lengthZ!, y: -Math.sin(a) * p.lengthZ! };
  }
  return tips;
};

export const rolesOf = (dim: AxisDim): AxisRole[] =>
  dim === 3 ? ["x", "y", "z"] : ["x", "y"];

/** Centro donde va la etiqueta: pasado el extremo de la flecha, en su misma dirección. */
export const labelCenter = (tip: Vec, gap = 16): Vec => {
  const len = Math.hypot(tip.x, tip.y) || 1;
  return { x: tip.x + (tip.x / len) * gap, y: tip.y + (tip.y / len) * gap };
};

/** Ángulo (grados, antihorario desde +x) y largo de una flecha, a partir de su extremo. */
export const tipToPolar = (tip: Vec): { angleDeg: number; length: number } => {
  const length = Math.hypot(tip.x, tip.y);
  let angleDeg = (Math.atan2(-tip.y, tip.x) * 180) / Math.PI;
  if (angleDeg < 0) {
    angleDeg += 360;
  }
  return { angleDeg, length };
};

/**
 * Tamaño de un eje a partir de un arrastre (en unidades de la hoja). Un clic sin arrastre
 * (o muy corto) usa el tamaño por defecto.
 */
export const paramsFromDrag = (
  dim: AxisDim,
  dx: number,
  dy: number,
  minDrag = 12,
): AxisParams => {
  const w = Math.abs(dx);
  const h = Math.abs(dy);
  if (w < minDrag && h < minDrag) {
    return normalizeParams(dim, {});
  }
  const lengthX = w < minDrag ? DEFAULT_AXIS_LENGTH : w;
  const lengthY = h < minDrag ? DEFAULT_AXIS_LENGTH : h;
  return normalizeParams(dim, { lengthX, lengthY });
};
