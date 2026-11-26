/**
 * Exportar una hoja a un archivo (PNG / SVG / .excalidraw). La interfaz genera el contenido y el
 * proceso principal lo escribe donde la persona elija en el diálogo nativo de guardado:
 * la interfaz nunca elige la ruta (no puede escribir en cualquier lado).
 */
import fs from "node:fs";
import path from "node:path";

import { app, dialog, ipcMain } from "electron";

import { IPC_CHANNELS } from "./api";
import { isTrustedSender } from "./security";
import { WorkspaceError } from "./workspace/paths";
import { toResult } from "./workspace/result";

import type { ExportRequest, ExportResult } from "./workspace/types";

export const MAX_EXPORT_BYTES = 300 * 1024 * 1024;

const EXT = { png: "png", svg: "svg", json: "excalidraw" } as const;
const FILTER_NAME = {
  png: "Imagen PNG",
  svg: "Imagen SVG",
  json: "Hoja de Excalidraw",
} as const;

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Nombre de archivo seguro en Windows a partir del nombre de la hoja. */
export const exportFileName = (name: unknown, format: keyof typeof EXT) => {
  let base = typeof name === "string" ? name : "";
  base = base
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\.(png|svg|excalidraw|json)$/i, "")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 100);
  if (!base || RESERVED.test(base)) {
    base = "Hoja";
  }
  return `${base}.${EXT[format]}`;
};

export type DecodedExport =
  | { ok: true; bytes: Buffer }
  | { ok: false; error: string };

/** Valida el pedido y devuelve los bytes a escribir (comprueba que el contenido sea del tipo pedido). */
export const decodeExport = (req: unknown): DecodedExport => {
  const r = req as Partial<ExportRequest> | null;
  if (!r || typeof r !== "object") {
    return { ok: false, error: "Pedido de exportación inválido." };
  }
  if (r.format !== "png" && r.format !== "svg" && r.format !== "json") {
    return { ok: false, error: "Formato no permitido." };
  }
  if (typeof r.content !== "string" || r.content.length === 0) {
    return { ok: false, error: "No hay nada para exportar." };
  }
  if (r.content.length > MAX_EXPORT_BYTES * 1.4) {
    return { ok: false, error: "La exportación es demasiado grande." };
  }
  const bytes =
    r.format === "png"
      ? Buffer.from(r.content, "base64")
      : Buffer.from(r.content, "utf8");
  if (bytes.length > MAX_EXPORT_BYTES) {
    return { ok: false, error: "La exportación es demasiado grande." };
  }
  if (r.format === "png") {
    const magic = [0x89, 0x50, 0x4e, 0x47];
    if (bytes.length < 8 || !magic.every((b, i) => bytes[i] === b)) {
      return { ok: false, error: "La imagen PNG generada no es válida." };
    }
  } else if (r.format === "svg") {
    if (!/<svg[\s>]/i.test(bytes.subarray(0, 2048).toString("utf8"))) {
      return { ok: false, error: "El SVG generado no es válido." };
    }
  } else {
    try {
      const j = JSON.parse(bytes.toString("utf8"));
      if (j?.type !== "excalidraw") {
        throw new Error("no es una hoja");
      }
    } catch {
      return {
        ok: false,
        error: "El archivo de la hoja generado no es válido.",
      };
    }
  }
  return { ok: true, bytes };
};

export const registerExportIpc = (
  getWindow: () => Electron.BrowserWindow | null,
  devUrl: string | null,
) => {
  ipcMain.handle(IPC_CHANNELS.saveExport, async (event, req: unknown) => {
    if (!isTrustedSender(event.senderFrame?.url ?? "", devUrl)) {
      return {
        ok: false,
        error: { code: "INVALID_OPERATION", message: "Origen no autorizado." },
      };
    }
    return toResult<ExportResult>(async () => {
      const decoded = decodeExport(req);
      if (!decoded.ok) {
        throw new WorkspaceError("INVALID_OPERATION", decoded.error);
      }
      const { format, suggestedName } = req as ExportRequest;
      const fileName = exportFileName(suggestedName, format);

      // Pruebas automáticas: sin diálogo, se escribe en la carpeta indicada
      const testDir =
        process.env.TUW_SELFTEST === "1" && process.env.TUW_EXPORT_DIR;
      let target: string | undefined;
      if (testDir) {
        target = path.join(testDir, fileName);
      } else {
        const win = getWindow();
        const options = {
          title: "Exportar hoja",
          defaultPath: path.join(app.getPath("documents"), fileName),
          filters: [{ name: FILTER_NAME[format], extensions: [EXT[format]] }],
        };
        const res = win
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options);
        if (res.canceled || !res.filePath) {
          return { saved: false as const };
        }
        target = res.filePath;
        // el diálogo ya filtra, pero la extensión se asegura igual
        if (path.extname(target).toLowerCase() !== `.${EXT[format]}`) {
          target += `.${EXT[format]}`;
        }
      }
      try {
        await fs.promises.writeFile(target, decoded.bytes);
      } catch {
        throw new WorkspaceError(
          "IO_ERROR",
          "No se pudo guardar el archivo (¿la carpeta está protegida o el disco lleno?).",
        );
      }
      return { saved: true as const, path: target };
    });
  });
};
