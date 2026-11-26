/**
 * TUW — Fondo de hoja: liso, cuadriculado, rayado y punteado.
 *
 * El color de fondo libre sigue siendo `appState.viewBackgroundColor`; esto agrega
 * el DIBUJO (patrón) que va encima, y se guarda dentro de la hoja (`appState.tuwBackground`).
 *
 * Este módulo es la única fuente de verdad: lo usan el lienzo, la exportación PNG y la
 * exportación SVG, así los tres se ven igual. Las funciones puras se prueban sin navegador.
 */
import { applyDarkModeFilter } from "@excalidraw/common";

export type SheetBackgroundType = "plain" | "grid" | "lines" | "dots";

export type SheetBackground = {
  type: SheetBackgroundType;
  /** Color de las líneas/puntos (#rgb, #rrggbb, #rrggbbaa). `null` = automático según el fondo. */
  lineColor: string | null;
  /** Separación entre líneas/puntos, en unidades de la hoja. */
  spacing: number;
};

export const SHEET_BACKGROUND_TYPES: readonly SheetBackgroundType[] = [
  "plain",
  "grid",
  "lines",
  "dots",
];

export const MIN_SHEET_SPACING = 8;
export const MAX_SHEET_SPACING = 120;
export const DEFAULT_SHEET_SPACING = 24;

export const DEFAULT_SHEET_BACKGROUND: SheetBackground = {
  type: "plain",
  lineColor: null,
  spacing: DEFAULT_SHEET_SPACING,
};

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export const isValidPatternColor = (value: unknown): value is string =>
  typeof value === "string" && HEX_COLOR.test(value);

/**
 * Acepta cualquier valor (archivos viejos, editados a mano o dañados) y devuelve un
 * fondo válido: lo que no sirve vuelve al valor por defecto.
 */
export const normalizeSheetBackground = (value: unknown): SheetBackground => {
  const v = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
  const type = SHEET_BACKGROUND_TYPES.includes(v.type as SheetBackgroundType)
    ? (v.type as SheetBackgroundType)
    : DEFAULT_SHEET_BACKGROUND.type;
  const rawSpacing = typeof v.spacing === "number" ? v.spacing : NaN;
  const spacing = Number.isFinite(rawSpacing)
    ? Math.min(MAX_SHEET_SPACING, Math.max(MIN_SHEET_SPACING, rawSpacing))
    : DEFAULT_SHEET_SPACING;
  return {
    type,
    lineColor: isValidPatternColor(v.lineColor) ? v.lineColor : null,
    spacing,
  };
};

export const isSameSheetBackground = (
  a: SheetBackground,
  b: SheetBackground,
): boolean =>
  a.type === b.type && a.lineColor === b.lineColor && a.spacing === b.spacing;

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

/** Luminancia relativa (0 negro … 1 blanco) de un color hexadecimal; blanco si no se entiende. */
export const luminanceOf = (color: string): number => {
  const m = HEX_COLOR.exec(color.trim());
  if (!m) {
    return 1;
  }
  let hex = m[1];
  if (hex.length === 3) {
    hex = [...hex].map((c) => c + c).join("");
  }
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export type PatternStyle = { color: string; alpha: number };

/**
 * Color y opacidad con que se dibuja el patrón.
 * - Automático (`lineColor` null): gris suave que contrasta con el fondo (oscuro sobre claro,
 *   claro sobre oscuro), así se ve bien con cualquier color de fondo.
 * - Con color propio: ese color, tal cual (con el filtro del modo oscuro si corresponde).
 */
export const resolvePatternStyle = (
  backgroundColor: string,
  lineColor: string | null,
  darkMode: boolean,
): PatternStyle => {
  if (lineColor) {
    return { color: applyDarkModeFilter(lineColor, darkMode), alpha: 1 };
  }
  const shown = applyDarkModeFilter(backgroundColor, darkMode);
  return luminanceOf(shown) > 0.45
    ? { color: "#000000", alpha: 0.16 }
    : { color: "#ffffff", alpha: 0.2 };
};

// ---------------------------------------------------------------------------
// Geometría (en unidades de la hoja)
// ---------------------------------------------------------------------------

/** Menor separación en pantalla (px) a partir de la cual se dibuja: más junto sería ruido. */
const MIN_ON_SCREEN_SPACING = { grid: 6, lines: 6, dots: 10 } as const;

export const isPatternVisible = (bg: SheetBackground, zoom: number): boolean =>
  bg.type !== "plain" && bg.spacing * zoom >= MIN_ON_SCREEN_SPACING[bg.type];

/** Grosor de línea: 1 unidad de hoja, pero nunca menos de 1 px en pantalla. */
export const patternLineWidth = (zoom: number): number => Math.max(1, 1 / zoom);

/** Radio de un punto: 1,2 unidades, pero nunca menos de 1,2 px en pantalla. */
export const patternDotRadius = (zoom: number): number =>
  Math.max(1.2, 1.2 / zoom);

/** Posiciones (en unidades de la hoja, alineadas al origen) de las líneas/puntos dentro de [from, to]. */
export const patternPositions = (
  spacing: number,
  from: number,
  to: number,
): number[] => {
  const out: number[] = [];
  const first = Math.floor(from / spacing) * spacing;
  for (let p = first; p <= to + spacing; p += spacing) {
    out.push(p);
  }
  return out;
};

/** Tope de elementos por cuadro para que arrastrar o hacer zoom nunca se trabe. */
const MAX_LINES = 1500;
const MAX_DOTS = 25000;

// ---------------------------------------------------------------------------
// Lienzo (pantalla y exportación PNG)
// ---------------------------------------------------------------------------

/**
 * Dibuja el patrón. El contexto ya está escalado por el zoom (como en `strokeGrid`):
 * las coordenadas de la hoja se pasan a pantalla sumando `scrollX/scrollY`.
 *
 * @param width/height  tamaño visible en unidades de la hoja
 * @param scale         devicePixelRatio (o escala de exportación)
 */
const drawSheetBackgroundDirect = (
  context: CanvasRenderingContext2D,
  bg: SheetBackground,
  style: PatternStyle,
  scrollX: number,
  scrollY: number,
  zoom: number,
  width: number,
  height: number,
  scale: number,
) => {
  if (!isPatternVisible(bg, zoom)) {
    return;
  }
  const devicePixels = zoom * scale;
  // x/y en coordenadas del contexto (ya incluyen el scroll)
  const xs = patternPositions(bg.spacing, -scrollX, -scrollX + width).map(
    (p) => p + scrollX,
  );
  const ys = patternPositions(bg.spacing, -scrollY, -scrollY + height).map(
    (p) => p + scrollY,
  );

  context.save();
  context.globalAlpha = style.alpha;

  if (bg.type === "dots") {
    if (xs.length * ys.length > MAX_DOTS) {
      context.restore();
      return;
    }
    const r = patternDotRadius(zoom);
    context.fillStyle = style.color;
    context.beginPath();
    for (const y of ys) {
      for (const x of xs) {
        context.moveTo(x + r, y);
        context.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    context.fill();
    context.restore();
    return;
  }

  const wantsVertical = bg.type === "grid";
  if (ys.length + (wantsVertical ? xs.length : 0) > MAX_LINES) {
    context.restore();
    return;
  }

  // Una línea de n píxeles de dispositivo se centra para cubrirlos exactamente (media posición si n es impar):
  // así se ve nítida en vez de repartirse en dos píxeles claros.
  const widthInDevicePixels = Math.max(
    1,
    Math.round(patternLineWidth(zoom) * devicePixels),
  );
  const lineWidth = widthInDevicePixels / devicePixels;
  const center = widthInDevicePixels % 2 ? 0.5 : 0;
  const snap = (p: number) =>
    (Math.round(p * devicePixels - center) + center) / devicePixels;

  const minX = Math.min(...xs) - bg.spacing;
  const maxX = Math.max(...xs) + bg.spacing;
  const minY = Math.min(...ys) - bg.spacing;
  const maxY = Math.max(...ys) + bg.spacing;

  context.lineWidth = lineWidth;
  context.strokeStyle = style.color;
  context.setLineDash([]);
  context.beginPath();
  for (const y of ys) {
    const sy = snap(y);
    context.moveTo(minX, sy);
    context.lineTo(maxX, sy);
  }
  if (wantsVertical) {
    for (const x of xs) {
      const sx = snap(x);
      context.moveTo(sx, minY);
      context.lineTo(sx, maxY);
    }
  }
  context.stroke();
  context.restore();
};

// --- Capa en caché (solo pantalla) ---------------------------------------------------
// El patrón es periódico: al desplazar la hoja basta COPIAR una capa ya dibujada, corrida un
// número entero de píxeles, en vez de volver a trazar miles de puntos o líneas en cada cuadro.
// Se arma solo cuando la vista está estable (mismo zoom, tamaño y estilo en dos cuadros seguidos);
// durante un zoom continuo cada cuadro se dibuja directo, como antes.
type CachedLayer = { key: string; canvas: HTMLCanvasElement | OffscreenCanvas };
let lastLayerKey: string | null = null;
let cachedLayer: CachedLayer | null = null;

const createLayerCanvas = (w: number, h: number) => {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(w, h);
  }
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  return null;
};

const positiveMod = (a: number, n: number) => ((a % n) + n) % n;

/** Libera la capa en caché (p. ej. al cambiar de hoja o de estilo). */
export const clearSheetBackgroundCache = () => {
  lastLayerKey = null;
  cachedLayer = null;
};

const renderFromCache = (
  context: CanvasRenderingContext2D,
  bg: SheetBackground,
  style: PatternStyle,
  scrollX: number,
  scrollY: number,
  zoom: number,
  scale: number,
): boolean => {
  const canvas = context.canvas as HTMLCanvasElement | undefined;
  const period = bg.spacing * zoom * scale; // píxeles de dispositivo entre líneas/puntos
  if (!canvas || !canvas.width || !canvas.height || period < 3) {
    return false;
  }
  const w = Math.ceil(canvas.width + period) + 2;
  const h = Math.ceil(canvas.height + period) + 2;
  const key = [
    bg.type,
    bg.spacing,
    zoom,
    scale,
    w,
    h,
    style.color,
    style.alpha,
  ].join("|");

  if (!cachedLayer || cachedLayer.key !== key) {
    if (lastLayerKey !== key) {
      lastLayerKey = key; // primera vez con este estilo: se dibuja directo
      return false;
    }
    const layer = createLayerCanvas(w, h);
    const lctx = layer?.getContext("2d") as CanvasRenderingContext2D | null;
    if (!layer || !lctx) {
      return false;
    }
    // la capa tiene el patrón con su origen en (0,0); se corre al dibujarla
    lctx.setTransform(scale, 0, 0, scale, 0, 0);
    lctx.scale(zoom, zoom);
    drawSheetBackgroundDirect(
      lctx,
      bg,
      style,
      0,
      0,
      zoom,
      w / scale / zoom,
      h / scale / zoom,
      scale,
    );
    cachedLayer = { key, canvas: layer };
  }

  const toPixel = bg.type === "dots" ? Math.round : Math.floor;
  const x = toPixel(positiveMod(scrollX * zoom * scale, period) - period);
  const y = toPixel(positiveMod(scrollY * zoom * scale, period) - period);
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0); // en píxeles de dispositivo
  context.drawImage(cachedLayer.canvas as CanvasImageSource, x, y);
  context.restore();
  return true;
};

/**
 * Dibuja el patrón. El contexto ya está escalado por el zoom (como en `strokeGrid`):
 * las coordenadas de la hoja se pasan a pantalla sumando `scrollX/scrollY`.
 *
 * @param opts.cache  usar la capa en caché (solo para la pantalla; la exportación dibuja siempre directo)
 */
export const renderSheetBackground = (
  context: CanvasRenderingContext2D,
  bg: SheetBackground,
  style: PatternStyle,
  scrollX: number,
  scrollY: number,
  zoom: number,
  width: number,
  height: number,
  scale: number,
  opts: { cache?: boolean } = {},
) => {
  if (!isPatternVisible(bg, zoom)) {
    return;
  }
  if (
    opts.cache &&
    renderFromCache(context, bg, style, scrollX, scrollY, zoom, scale)
  ) {
    return;
  }
  drawSheetBackgroundDirect(
    context,
    bg,
    style,
    scrollX,
    scrollY,
    zoom,
    width,
    height,
    scale,
  );
};

// ---------------------------------------------------------------------------
// SVG (exportación)
// ---------------------------------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";

let patternCounter = 0;

/**
 * Agrega el patrón a un SVG: un `<pattern>` en `defs` y un `<rect>` que lo rellena.
 * El origen del patrón coincide con el (0,0) de la hoja (`offsetX/offsetY`), igual que en el lienzo.
 *
 * @returns el rectángulo a insertar sobre el fondo (o null si no hay patrón)
 */
export const buildSvgSheetBackground = (
  doc: Document,
  defs: Element,
  bg: SheetBackground,
  style: PatternStyle,
  opts: {
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  },
): Element | null => {
  if (bg.type === "plain") {
    return null;
  }
  const id = `tuw-sheet-bg-${patternCounter++}`;
  const s = bg.spacing;
  const w = patternLineWidth(1);
  const pattern = doc.createElementNS(SVG_NS, "pattern");
  pattern.setAttribute("id", id);
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  pattern.setAttribute("width", `${s}`);
  pattern.setAttribute("height", `${s}`);

  if (bg.type === "dots") {
    const r = patternDotRadius(1);
    // el punto se centra en la esquina del cuadro; se desplaza el origen para que caiga en la intersección
    pattern.setAttribute("x", `${opts.offsetX - r}`);
    pattern.setAttribute("y", `${opts.offsetY - r}`);
    const dot = doc.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", `${r}`);
    dot.setAttribute("cy", `${r}`);
    dot.setAttribute("r", `${r}`);
    dot.setAttribute("fill", style.color);
    dot.setAttribute("fill-opacity", `${style.alpha}`);
    pattern.appendChild(dot);
  } else {
    // La línea ocupa [k·s, k·s + grosor] (pegada al borde del cuadro): igual que en el lienzo, donde se
    // ajusta al píxel. Así, con 1 unidad = 1 px, queda nítida y coincide con el PNG.
    pattern.setAttribute("x", `${opts.offsetX}`);
    pattern.setAttribute("y", `${opts.offsetY}`);
    const d =
      bg.type === "grid"
        ? `M0 ${w / 2}H${s}M${w / 2} 0V${s}`
        : `M0 ${w / 2}H${s}`;
    const path = doc.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", style.color);
    path.setAttribute("stroke-opacity", `${style.alpha}`);
    path.setAttribute("stroke-width", `${w}`);
    pattern.appendChild(path);
  }
  defs.appendChild(pattern);

  const rect = doc.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", "0");
  rect.setAttribute("y", "0");
  rect.setAttribute("width", `${opts.width}`);
  rect.setAttribute("height", `${opts.height}`);
  rect.setAttribute("fill", `url(#${id})`);
  return rect;
};
