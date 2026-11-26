import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { cleanAppStateForExport } from "@excalidraw/excalidraw/appState";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import type { EditorBridge } from "./controller";

/** Conecta el controlador con el editor real (Excalidraw). */
export const makeEditorBridge = (
  api: ExcalidrawImperativeAPI,
): EditorBridge => ({
  replaceScene: (scene) => {
    const elements = scene.elements ?? [];
    const files = Object.values(scene.files ?? {});
    if (files.length) {
      api.addFiles(files);
    }
    api.updateScene({
      elements,
      // Solo lo que se guarda en el archivo (fondo, cuadrícula…). El estado completo traería
      // valores por defecto de la interfaz (panel abierto, herramienta…) y los reiniciaría.
      appState: cleanAppStateForExport(scene.appState ?? {}) as any,
      // cambiar de hoja no es un cambio "deshacible" de la hoja nueva
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    api.history.clear();
    if (elements.length) {
      // los elementos existen en el lienzo recién en el siguiente cuadro
      requestAnimationFrame(() => {
        if (!api.isDestroyed) {
          api.setViewport({
            target: elements as any,
            fit: "scale-down",
          });
        }
      });
    }
  },
});
