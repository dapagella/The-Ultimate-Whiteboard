/**
 * Presets de trazo tipo LibreOffice Impress: lápiz, lapicera, fibra y resaltador,
 * más los que guarde cada persona. Lógica PURA (sin React).
 */
import {
  MAX_TUW_STROKE_WIDTH,
  MIN_TUW_STROKE_WIDTH,
} from "@excalidraw/excalidraw/scene/tuwStroke";

import type { TuwStroke } from "@excalidraw/excalidraw/scene/tuwStroke";

export type StrokePreset = {
  id: string;
  name: string;
  builtin: boolean;
  color: string;
  /** Grosor en la escala del trazo libre (0,5 fino · 1 medio · 2 grueso). */
  strokeWidth: number;
  /** Opacidad 0–100. */
  opacity: number;
  /** variable = el grosor sigue la presión del lápiz; constant = siempre igual. */
  variability: "variable" | "constant";
  blendMode: "normal" | "multiply";
};

export const BUILTIN_PRESETS: readonly StrokePreset[] = [
  {
    id: "pencil",
    name: "Lápiz",
    builtin: true,
    color: "#495057", // grafito
    strokeWidth: 0.6,
    opacity: 85,
    variability: "variable",
    blendMode: "normal",
  },
  {
    id: "pen",
    name: "Lapicera",
    builtin: true,
    color: "#1e1e1e",
    strokeWidth: 1,
    opacity: 100,
    variability: "constant",
    blendMode: "normal",
  },
  {
    id: "marker",
    name: "Fibra",
    builtin: true,
    color: "#1e1e1e",
    strokeWidth: 2.4,
    opacity: 100,
    variability: "constant",
    blendMode: "normal",
  },
  {
    id: "highlighter",
    name: "Resaltador",
    builtin: true,
    color: "#ffd43b",
    strokeWidth: 9,
    opacity: 40,
    variability: "constant",
    blendMode: "multiply",
  },
];

export const MAX_CUSTOM_PRESETS = 12;
export const MAX_PRESET_NAME = 24;
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Cambios de estado del editor que aplica un preset. */
export type PresetAppStatePatch = {
  currentItemStrokeColor: string;
  currentItemOpacity: number;
  currentItemStrokeVariability: "variable" | "constant";
  tuwStroke: TuwStroke;
};

export const presetToAppState = (
  preset: StrokePreset,
): PresetAppStatePatch => ({
  currentItemStrokeColor: preset.color,
  currentItemOpacity: preset.opacity,
  currentItemStrokeVariability: preset.variability,
  tuwStroke: {
    preset: preset.id,
    strokeWidth: preset.strokeWidth,
    blendMode: preset.blendMode,
  },
});

/** Valida un preset leído del almacenamiento (o null si no sirve). */
export const normalizePreset = (raw: unknown): StrokePreset | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const v = raw as Record<string, unknown>;
  const name = typeof v.name === "string" ? v.name.trim() : "";
  if (
    typeof v.id !== "string" ||
    !/^custom-[\w-]{1,40}$/.test(v.id) ||
    !name ||
    typeof v.color !== "string" ||
    !HEX.test(v.color) ||
    typeof v.strokeWidth !== "number" ||
    !Number.isFinite(v.strokeWidth) ||
    typeof v.opacity !== "number" ||
    !Number.isFinite(v.opacity)
  ) {
    return null;
  }
  return {
    id: v.id,
    name: name.slice(0, MAX_PRESET_NAME),
    builtin: false,
    color: v.color,
    strokeWidth: Math.min(
      MAX_TUW_STROKE_WIDTH,
      Math.max(MIN_TUW_STROKE_WIDTH, v.strokeWidth),
    ),
    opacity: Math.min(100, Math.max(1, Math.round(v.opacity))),
    variability: v.variability === "variable" ? "variable" : "constant",
    blendMode: v.blendMode === "multiply" ? "multiply" : "normal",
  };
};

export const parseCustomPresets = (raw: unknown): StrokePreset[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const out: StrokePreset[] = [];
  for (const item of raw) {
    const p = normalizePreset(item);
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
  }
  return out.slice(0, MAX_CUSTOM_PRESETS);
};

/** Arma un preset propio con lo que está activo ahora (color, opacidad, presión, grosor y mezcla). */
export const presetFromCurrent = (
  name: string,
  current: {
    color: string;
    opacity: number;
    variability: "variable" | "constant";
    strokeWidth: number;
    blendMode: "normal" | "multiply";
  },
  id = `custom-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`,
): StrokePreset | null =>
  normalizePreset({
    id,
    name,
    color: current.color,
    opacity: current.opacity,
    variability: current.variability,
    strokeWidth: current.strokeWidth,
    blendMode: current.blendMode,
  });

export const allPresets = (custom: readonly StrokePreset[]): StrokePreset[] => [
  ...BUILTIN_PRESETS,
  ...custom,
];

export const findPreset = (
  id: string | null,
  custom: readonly StrokePreset[],
): StrokePreset | undefined =>
  id ? allPresets(custom).find((p) => p.id === id) : undefined;

// --- almacenamiento local (solo presets propios) -------------------------------------------
const STORAGE_KEY = "tuw-custom-stroke-presets";

export const loadCustomPresets = (): StrokePreset[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseCustomPresets(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
};

export const saveCustomPresets = (
  presets: readonly StrokePreset[],
): boolean => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    return true;
  } catch {
    return false;
  }
};

/** Agrega un preset propio (devuelve la lista nueva, o null si no cabe o el nombre ya existe). */
export const addCustomPreset = (
  list: readonly StrokePreset[],
  preset: StrokePreset,
): StrokePreset[] | null => {
  if (list.length >= MAX_CUSTOM_PRESETS) {
    return null;
  }
  const taken = new Set(
    allPresets(list).map((p) => p.name.trim().toLowerCase()),
  );
  if (taken.has(preset.name.trim().toLowerCase())) {
    return null;
  }
  return [...list, preset];
};

export const removeCustomPreset = (
  list: readonly StrokePreset[],
  id: string,
): StrokePreset[] => list.filter((p) => p.id !== id);
