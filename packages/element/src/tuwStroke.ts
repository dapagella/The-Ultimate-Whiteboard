import type { ExcalidrawElement } from "./types";

/**
 * TUW: los trazos creados con un preset de "resaltador" llevan
 * `customData.tuw.stroke.blendMode = "multiply"`: se mezclan con lo que hay debajo
 * (el texto negro sigue legible bajo el resaltado), en pantalla y en la exportación.
 */
export const isMultiplyStroke = (element: ExcalidrawElement): boolean =>
  element.type === "freedraw" &&
  element.customData?.tuw?.stroke?.blendMode === "multiply";
