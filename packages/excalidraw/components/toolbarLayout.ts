/**
 * TUW — barra de funciones personalizable: qué funciones están fijadas (y en qué orden), qué botón
 * del lápiz/mouse activa cada una, y las funciones que agrega la app (ejes, fórmula…).
 * Lógica pura + un almacén mínimo (se guarda en esta PC, no en las hojas).
 */
import { useSyncExternalStore } from "react";

import type { ReactNode } from "react";

/** Funciones del editor que pueden ir en la barra (mismo id que el tipo de herramienta). */
export const NATIVE_TOOL_IDS = [
  "hand",
  "selection",
  "lasso",
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
  "text",
  "stickynote",
  "eraser",
  "image",
  "frame",
  "embeddable",
  "autoshape",
  "laser",
  "bucketfill",
] as const;

export type NativeToolId = typeof NATIVE_TOOL_IDS[number];

export const isNativeToolId = (id: string): id is NativeToolId =>
  (NATIVE_TOOL_IDS as readonly string[]).includes(id);

/** Lo que viene fijado la primera vez (los ids que la app no registró se ignoran). */
export const DEFAULT_PINNED: readonly string[] = [
  "hand",
  "selection",
  "lasso",
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
  "text",
  "stickynote",
  "eraser",
  "axes2d",
  "axes3d",
  "latex",
  "imageurl",
];

export type HostToolbarItem = {
  id: string;
  label: string;
  icon: ReactNode;
  /** Se ejecuta al tocar el botón. */
  onSelect: () => void;
  /** Resaltado como herramienta activa. */
  active?: boolean;
};

// --- funciones puras -----------------------------------------------------------------------

/** Lista válida: sin repetidos y solo ids conocidos. `null` = usar lo de fábrica. */
export const normalizePinned = (
  raw: unknown,
  known: readonly string[],
): string[] => {
  const base = Array.isArray(raw) ? raw : DEFAULT_PINNED;
  const out: string[] = [];
  for (const id of base) {
    if (typeof id === "string" && known.includes(id) && !out.includes(id)) {
      out.push(id);
    }
  }
  return out;
};

export const movePinned = (
  list: readonly string[],
  id: string,
  toIndex: number,
): string[] => {
  const from = list.indexOf(id);
  if (from === -1) {
    return [...list];
  }
  const next = list.filter((x) => x !== id);
  const at = Math.max(0, Math.min(next.length, toIndex));
  next.splice(at, 0, id);
  return next;
};

/** Mueve un paso a la izquierda (-1) o a la derecha (+1). */
export const nudgePinned = (
  list: readonly string[],
  id: string,
  dir: -1 | 1,
): string[] => {
  const i = list.indexOf(id);
  return i === -1 ? [...list] : movePinned(list, id, i + dir);
};

export const pinItem = (list: readonly string[], id: string): string[] =>
  list.includes(id) ? [...list] : [...list, id];

export const unpinItem = (list: readonly string[], id: string): string[] =>
  list.filter((x) => x !== id);

// --- botones del lápiz / mouse -------------------------------------------------------------

/** `button` del evento → bit dentro de `buttons`. */
const BUTTON_TO_BIT = [1, 4, 2, 8, 16, 32];
const BIT_NAME: Record<number, string> = {
  2: "botón del costado / clic derecho",
  4: "botón del medio (rueda)",
  8: "botón atrás",
  16: "botón adelante",
  32: "goma / punta trasera",
};

export const bitName = (bit: number) => BIT_NAME[bit] ?? `botón ${bit}`;

/** Bits de botones secundarios apretados en este evento (sin la punta/clic izquierdo). */
export const secondaryBits = (e: {
  button: number;
  buttons: number;
}): number[] => {
  let mask = e.buttons & ~1;
  if (e.button > 0) {
    mask |= BUTTON_TO_BIT[e.button] ?? 0;
  }
  const bits: number[] = [];
  for (let b = 2; b <= 32; b <<= 1) {
    if (mask & b) {
      bits.push(b);
    }
  }
  return bits;
};

export const assignmentKey = (pointerType: string, bit: number) =>
  `${pointerType === "pen" ? "pen" : "other"}:${bit}`;

/** ¿Se puede asignar este botón? El clic derecho del mouse no (hace falta para el menú). */
export const isAssignable = (pointerType: string, bit: number) =>
  pointerType === "pen" ? true : bit !== 2;

export const findAssignment = (
  assignments: Readonly<Record<string, string>>,
  e: { pointerType: string; button: number; buttons: number },
): { itemId: string; bit: number } | null => {
  for (const bit of secondaryBits(e)) {
    const itemId = assignments[assignmentKey(e.pointerType, bit)];
    if (itemId) {
      return { itemId, bit };
    }
  }
  return null;
};

export const describeAssignmentKey = (key: string) => {
  const [type, bit] = key.split(":");
  return `${type === "pen" ? "lápiz" : "mouse"}: ${bitName(Number(bit))}`;
};

// --- almacén -------------------------------------------------------------------------------

const STORAGE_KEY = "tuw.toolbar.layout";

type Persisted = {
  pinned: string[] | null;
  assignments: Record<string, string>;
};

type StoreState = Persisted & {
  hostItems: readonly HostToolbarItem[];
  /** Id de la función a la que se le está eligiendo botón. */
  assigning: string | null;
};

const loadPersisted = (): Persisted => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    const assignments: Record<string, string> = {};
    if (raw?.assignments && typeof raw.assignments === "object") {
      for (const [k, v] of Object.entries(raw.assignments)) {
        if (/^(pen|other):\d+$/.test(k) && typeof v === "string") {
          assignments[k] = v;
        }
      }
    }
    return {
      pinned: Array.isArray(raw?.pinned)
        ? raw.pinned.filter((x: unknown) => typeof x === "string")
        : null,
      assignments,
    };
  } catch {
    return { pinned: null, assignments: {} };
  }
};

let state: StoreState = {
  ...loadPersisted(),
  hostItems: [],
  assigning: null,
};
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

const persist = () => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        pinned: state.pinned,
        assignments: state.assignments,
      }),
    );
  } catch {
    // sin almacenamiento: vale solo para esta sesión
  }
};

const set = (patch: Partial<StoreState>, save = true) => {
  state = { ...state, ...patch };
  if (save) {
    persist();
  }
  emit();
};

export const subscribeToolbar = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const getToolbarState = () => state;

export const useToolbarState = () =>
  useSyncExternalStore(subscribeToolbar, getToolbarState, getToolbarState);

/** La app registra sus propias funciones (ejes, fórmula…). Se puede llamar de nuevo para actualizarlas. */
export const registerToolbarItems = (items: readonly HostToolbarItem[]) =>
  set({ hostItems: items }, false);

export const knownToolbarIds = (s: StoreState = state) => [
  ...NATIVE_TOOL_IDS,
  ...s.hostItems.map((i) => i.id),
];

export const getPinned = (s: StoreState = state) =>
  normalizePinned(s.pinned, knownToolbarIds(s));

export const setPinned = (list: string[]) => set({ pinned: list });

export const resetToolbarLayout = () => set({ pinned: null });

export const startAssigning = (id: string | null) =>
  set({ assigning: id }, false);

export const assignButton = (key: string, itemId: string) =>
  set({
    assignments: { ...state.assignments, [key]: itemId },
    assigning: null,
  });

export const clearAssignments = (itemId: string) =>
  set({
    assignments: Object.fromEntries(
      Object.entries(state.assignments).filter(([, v]) => v !== itemId),
    ),
  });

export const getToolbarAssignments = () => state.assignments;

export const getHostToolbarItem = (id: string) =>
  state.hostItems.find((i) => i.id === id);
