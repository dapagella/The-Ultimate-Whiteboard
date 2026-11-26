import { isTestEnv } from "@excalidraw/common";
import { defaultLang, languages } from "@excalidraw/excalidraw";
import LanguageDetector from "i18next-browser-languagedetector";

/** Idioma por defecto de The Ultimate Whiteboard (Q8). */
export const TUW_DEFAULT_LANG_CODE = "es-ES";

export const languageDetector = new LanguageDetector();

// Solo se respeta la elección guardada por el usuario: no se deduce del idioma
// del navegador/sistema, para que arranque siempre en español.
languageDetector.init(
  { languageUtils: {} },
  { order: ["localStorage"], caches: ["localStorage"] },
);

export const getPreferredLanguage = () => {
  const detectedLanguages = languageDetector.detect();

  const detectedLanguage = Array.isArray(detectedLanguages)
    ? detectedLanguages[0]
    : detectedLanguages;

  const initialLanguage =
    (detectedLanguage
      ? // region code may not be defined if user uses generic preferred language
        // (e.g. chinese vs instead of chinese-simplified)
        languages.find((lang) => lang.code.startsWith(detectedLanguage))?.code
      : null) ||
    // los tests heredados esperan la interfaz en inglés
    (isTestEnv() ? defaultLang.code : TUW_DEFAULT_LANG_CODE);

  return initialLanguage;
};
