/**
 * Estilo por defecto de las hojas NUEVAS (Q9): color y dibujo de fondo.
 * Se guarda en el navegador de la app (localStorage del programa), no dentro de las hojas.
 */
import {
  DEFAULT_SHEET_BACKGROUND,
  isSameSheetBackground,
  normalizeSheetBackground,
} from "@excalidraw/excalidraw/scene/sheetBackground";

import type { SheetBackground } from "@excalidraw/excalidraw/scene/sheetBackground";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";

export type DefaultSheetStyle = {
  viewBackgroundColor: string;
  tuwBackground: SheetBackground;
};

const STORAGE_KEY = "tuw-default-sheet-style";
const COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const FACTORY_SHEET_STYLE: DefaultSheetStyle = {
  viewBackgroundColor: "#ffffff",
  tuwBackground: DEFAULT_SHEET_BACKGROUND,
};

/** Valida cualquier valor leído del almacenamiento. Devuelve null si no hay nada utilizable. */
export const parseDefaultSheetStyle = (
  raw: unknown,
): DefaultSheetStyle | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const v = raw as Record<string, unknown>;
  if (
    typeof v.viewBackgroundColor !== "string" ||
    !COLOR_RE.test(v.viewBackgroundColor)
  ) {
    return null;
  }
  return {
    viewBackgroundColor: v.viewBackgroundColor,
    tuwBackground: normalizeSheetBackground(v.tuwBackground),
  };
};

export const isFactoryStyle = (style: DefaultSheetStyle): boolean =>
  style.viewBackgroundColor.toLowerCase() ===
    FACTORY_SHEET_STYLE.viewBackgroundColor &&
  isSameSheetBackground(style.tuwBackground, FACTORY_SHEET_STYLE.tuwBackground);

export const getDefaultSheetStyle = (): DefaultSheetStyle | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseDefaultSheetStyle(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

export const saveDefaultSheetStyle = (style: DefaultSheetStyle): boolean => {
  try {
    if (isFactoryStyle(style)) {
      localStorage.removeItem(STORAGE_KEY); // "liso y blanco" es lo de fábrica: no hace falta guardarlo
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(style));
    }
    return true;
  } catch {
    return false;
  }
};

export const clearDefaultSheetStyle = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // sin almacenamiento
  }
};

/** Aplica el estilo por defecto a la escena de una hoja recién creada. */
export const applyDefaultStyle = (
  scene: ExcalidrawInitialDataState,
  style: DefaultSheetStyle | null,
): ExcalidrawInitialDataState => {
  if (!style) {
    return scene;
  }
  return {
    ...scene,
    appState: {
      ...scene.appState,
      viewBackgroundColor: style.viewBackgroundColor,
      tuwBackground: style.tuwBackground,
    } as ExcalidrawInitialDataState["appState"],
  };
};
