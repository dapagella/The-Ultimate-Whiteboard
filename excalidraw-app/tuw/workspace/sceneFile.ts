import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import {
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";

import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";

/**
 * Escena → texto de un archivo `.excalidraw` estándar (con las imágenes embebidas
 * en `files`), compatible con excalidraw.com.
 */
export const serializeScene = (
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
): string => serializeAsJSON(elements, appState, files, "local");

export class InvalidSceneError extends Error {
  constructor(message = "El archivo no es una hoja válida.") {
    super(message);
    this.name = "InvalidSceneError";
  }
}

/** Texto de un archivo `.excalidraw` → datos listos para el editor. */
export const parseScene = (content: string): ExcalidrawInitialDataState => {
  let data: any;
  try {
    data = JSON.parse(content);
  } catch {
    throw new InvalidSceneError();
  }
  if (
    !data ||
    typeof data !== "object" ||
    data.type !== "excalidraw" ||
    (data.elements && !Array.isArray(data.elements))
  ) {
    throw new InvalidSceneError();
  }
  return {
    elements: restoreElements(data.elements ?? [], null, {
      repairBindings: true,
      deleteInvisibleElements: true,
    }),
    appState: restoreAppState(data.appState, null),
    files:
      data.files && typeof data.files === "object"
        ? (data.files as BinaryFiles)
        : {},
  };
};
