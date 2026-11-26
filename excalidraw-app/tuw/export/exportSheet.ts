/**
 * Arma el contenido de una hoja exportada (PNG / SVG / .excalidraw). Incluye fondo de la hoja,
 * resaltador (multiply), fórmulas e imágenes: usa el mismo render que la pantalla.
 */
import { exportScene } from "@excalidraw/excalidraw";
import { cleanAppStateForExport } from "@excalidraw/excalidraw/appState";
import { getNonDeletedElements } from "@excalidraw/element";

import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import { serializeScene } from "../workspace/sceneFile";

import type { ExportRequest } from "../../../desktop/src/api";

export type ExportFormat = ExportRequest["format"];

export type SheetData = {
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
};

export type ExportOptions = {
  format: ExportFormat;
  /** Resolución del PNG (1×, 2×, 3×). */
  scale: 1 | 2 | 3;
  /** false = fondo transparente (PNG/SVG). */
  background: boolean;
};

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: "png",
  scale: 2,
  background: true,
};

const PADDING = 24;

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export class EmptySheetError extends Error {
  constructor() {
    super("La hoja está vacía: no hay nada para exportar.");
    this.name = "EmptySheetError";
  }
}

/** Texto (svg/json) o base64 (png) listo para `window.tuw.saveExport`. */
export const buildExportContent = async (
  sheet: SheetData,
  opts: ExportOptions,
): Promise<string> => {
  const elements = getNonDeletedElements(sheet.elements);
  if (elements.length === 0) {
    throw new EmptySheetError();
  }
  if (opts.format === "json") {
    return serializeScene(sheet.elements, sheet.appState, sheet.files);
  }
  const data = {
    elements,
    appState: cleanAppStateForExport(sheet.appState),
    files: sheet.files,
  };
  const config = {
    padding: PADDING,
    scale: opts.scale,
    canvasBackgroundColor: opts.background ? undefined : (false as const),
  };
  if (opts.format === "svg") {
    const svg = await exportScene({
      type: "svg",
      data,
      config: { ...config, scale: 1, embedScene: true },
    });
    return new XMLSerializer().serializeToString(svg);
  }
  const blob = await exportScene({
    type: "png",
    data,
    config: { ...config, embedScene: true },
  });
  return blobToBase64(blob);
};
