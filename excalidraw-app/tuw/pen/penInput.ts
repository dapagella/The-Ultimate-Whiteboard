/**
 * Lógica PURA del lápiz (sin DOM): clasifica un evento de puntero y decide qué hacer con él.
 * La parte que toca el navegador está en PenGuard.tsx.
 *
 * Los botones del lápiz dependen del driver (Wacom, XP-Pen, Surface…): el barril suele llegar como
 * `buttons & 2` (como un clic derecho) y la goma de la punta trasera como `button 5` / `buttons & 32`.
 * Por eso el modo "detectar botón" del diálogo muestra lo que llega realmente.
 */

export type BarrelAction = "eraser" | "contextMenu" | "pan" | "none";

export const BARREL_ACTIONS: { value: BarrelAction; label: string }[] = [
  { value: "eraser", label: "Borrar mientras lo mantengo apretado" },
  { value: "contextMenu", label: "Abrir el menú (clic derecho)" },
  { value: "pan", label: "Mover la hoja" },
  { value: "none", label: "Nada (el botón se ignora)" },
];

export type PenSettings = {
  barrel: BarrelAction;
  /** Ignora el dedo y la palma mientras el lápiz está cerca de la pantalla. */
  rejectPalm: boolean;
};

export const DEFAULT_PEN_SETTINGS: PenSettings = {
  barrel: "eraser", // Q20
  rejectPalm: true,
};

export const normalizePenSettings = (raw: unknown): PenSettings => {
  const r = (raw ?? {}) as Partial<PenSettings>;
  return {
    barrel: BARREL_ACTIONS.some((a) => a.value === r.barrel)
      ? (r.barrel as BarrelAction)
      : DEFAULT_PEN_SETTINGS.barrel,
    rejectPalm:
      typeof r.rejectPalm === "boolean"
        ? r.rejectPalm
        : DEFAULT_PEN_SETTINGS.rejectPalm,
  };
};

export type PointerLike = {
  pointerType: string;
  button: number;
  buttons: number;
  width?: number;
  height?: number;
};

/** Tiempo que el lápiz se considera "cerca" después de su último evento (la palma suele apoyarse justo entonces). */
export const PEN_GRACE_MS = 700;
/** Un dedo con una zona de contacto así de grande (px) es una palma. */
export const PALM_SIZE = 40;

const BUTTON_BARREL = 2;
const BUTTON_ERASER = 5;
const BUTTONS_BARREL = 2;
const BUTTONS_ERASER = 32;

export const isPen = (p: PointerLike) => p.pointerType === "pen";

/** Botón del costado del lápiz apretado (llega como "clic derecho"). */
export const isBarrelPressed = (p: PointerLike) =>
  isPen(p) &&
  ((p.buttons & BUTTONS_BARREL) !== 0 || p.button === BUTTON_BARREL);

/** Punta trasera (goma) del lápiz. */
export const isEraserTip = (p: PointerLike) =>
  isPen(p) &&
  ((p.buttons & BUTTONS_ERASER) !== 0 || p.button === BUTTON_ERASER);

export const isPalmLike = (p: PointerLike) =>
  p.pointerType === "touch" &&
  Math.max(p.width ?? 0, p.height ?? 0) >= PALM_SIZE;

/** ¿Hay que ignorar este toque porque el lápiz está cerca (o es una palma)? */
export const shouldRejectTouch = (
  p: PointerLike,
  settings: PenSettings,
  now: number,
  lastPenAt: number,
): boolean => {
  if (!settings.rejectPalm || p.pointerType !== "touch") {
    return false;
  }
  return isPalmLike(p) || now - lastPenAt < PEN_GRACE_MS;
};

export type Phase = "down" | "move" | "up";
export type Retarget = { button: number; buttons: number };

/**
 * Con el botón del costado apretado, ¿con qué botón "se disfraza" el evento para que el editor
 * haga la acción elegida? `null` = no tocarlo (el editor ya hace lo suyo, p. ej. el menú).
 */
export const retargetFor = (
  action: BarrelAction,
  phase: Phase,
): Retarget | null => {
  switch (action) {
    case "eraser": // el editor ya cambia a la goma con el botón 5
      return phase === "down"
        ? { button: BUTTON_ERASER, buttons: BUTTONS_ERASER }
        : phase === "move"
        ? { button: -1, buttons: BUTTONS_ERASER }
        : { button: BUTTON_ERASER, buttons: 0 };
    case "pan": // botón del medio = mover la hoja
      return phase === "down"
        ? { button: 1, buttons: 4 }
        : phase === "move"
        ? { button: -1, buttons: 4 }
        : { button: 1, buttons: 0 };
    case "none": // se ignora el botón: la punta dibuja normal
      return phase === "down"
        ? { button: 0, buttons: 1 }
        : phase === "move"
        ? { button: -1, buttons: 1 }
        : { button: 0, buttons: 0 };
    case "contextMenu":
      return null;
  }
};

/** Texto corto para el modo "detectar botón". */
export const describePointer = (
  p: PointerLike & { pressure?: number; type?: string },
): string => {
  const parts = [
    `${p.type ?? "evento"}`,
    `tipo=${p.pointerType}`,
    `button=${p.button}`,
    `buttons=${p.buttons}`,
  ];
  if (typeof p.pressure === "number") {
    parts.push(`presión=${p.pressure.toFixed(2)}`);
  }
  const tags: string[] = [];
  if (isBarrelPressed(p)) {
    tags.push("botón del costado");
  }
  if (isEraserTip(p)) {
    tags.push("goma");
  }
  if (isPalmLike(p)) {
    tags.push("palma");
  }
  return tags.length
    ? `${parts.join(" ")} → ${tags.join(", ")}`
    : parts.join(" ");
};
