import { appJotaiStore, atom } from "../../app-jotai";

import { DEFAULT_PEN_SETTINGS, normalizePenSettings } from "./penInput";

import type { PenSettings } from "./penInput";

const KEY = "tuw.pen.settings";

const load = (): PenSettings => {
  try {
    return normalizePenSettings(
      JSON.parse(localStorage.getItem(KEY) ?? "null"),
    );
  } catch {
    return DEFAULT_PEN_SETTINGS;
  }
};

/** Ajustes del lápiz (se guardan en esta PC, no en las hojas). */
export const penSettingsAtom = atom<PenSettings>(load());

export const savePenSettings = (next: PenSettings) => {
  const clean = normalizePenSettings(next);
  appJotaiStore.set(penSettingsAtom, clean);
  try {
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    // sin almacenamiento: los ajustes valen solo para esta sesión
  }
};

export const penDialogOpenAtom = atom(false);
