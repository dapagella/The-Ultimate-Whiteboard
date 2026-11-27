import { atom } from "../../app-jotai";

import type { AxisDim } from "./geometry";

/** Herramienta de ejes activa (2D o 3D): el próximo arrastre sobre la hoja coloca un eje. */
export const axesModeAtom = atom<AxisDim | null>(null);
