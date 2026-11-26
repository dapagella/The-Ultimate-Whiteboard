import { atom } from "../../app-jotai";

/**
 * Diálogo "Exportar hoja". `path` = hoja del espacio de trabajo a exportar;
 * `null` = la hoja que está abierta ahora (con lo último que se dibujó).
 */
export const exportDialogAtom = atom<{ path: string | null } | null>(null);
