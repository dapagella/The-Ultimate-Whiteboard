import { atom } from "../../app-jotai";

/** Diálogo de fórmula: nueva, o editando una imagen que ya existe. */
export type LatexDialogState = { mode: "new" } | { mode: "edit"; id: string };

export const latexDialogAtom = atom<LatexDialogState | null>(null);

/** Diálogo "Insertar imagen desde URL". */
export const imageUrlDialogOpenAtom = atom(false);
