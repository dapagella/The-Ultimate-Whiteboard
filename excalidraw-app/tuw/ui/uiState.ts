import { appJotaiStore, atom } from "../../app-jotai";

export const MIN_UI_SCALE = 50;
export const MAX_UI_SCALE = 150;
export const DEFAULT_UI_SCALE = 100;

const KEY = "tuw.ui.scale";

export const clampUiScale = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n)
    ? Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, Math.round(n)))
    : DEFAULT_UI_SCALE;
};

const load = (): number => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? DEFAULT_UI_SCALE : clampUiScale(JSON.parse(raw));
  } catch {
    return DEFAULT_UI_SCALE;
  }
};

/** Tamaño de los menús y paneles (porcentaje). No cambia el tamaño de la hoja. */
export const uiScaleAtom = atom<number>(load());

export const saveUiScale = (v: number) => {
  const clean = clampUiScale(v);
  appJotaiStore.set(uiScaleAtom, clean);
  try {
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    // sin almacenamiento: vale solo para esta sesión
  }
};

export const uiScaleDialogAtom = atom(false);

/** Menús escondidos mientras se dibuja (queda solo la barra de funciones). */
export const uiHiddenAtom = atom(false);

/** Herramientas con las que, al empezar a dibujar, se esconden los menús. */
const DRAWING_TOOLS = new Set([
  "freedraw",
  "line",
  "arrow",
  "rectangle",
  "diamond",
  "ellipse",
  "eraser",
  "text",
  "stickynote",
]);

export const hidesMenusWhileDrawing = (toolType: string) =>
  DRAWING_TOOLS.has(toolType);
