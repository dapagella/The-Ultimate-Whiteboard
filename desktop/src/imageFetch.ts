/**
 * Descarga de imágenes por URL, hecha en el proceso principal (sin las restricciones CORS del navegador).
 * La interfaz solo recibe los bytes ya validados.
 */
import { ipcMain, net } from "electron";

import { IPC_CHANNELS } from "./api";
import {
  MAX_IMAGE_BYTES,
  nameFromUrl,
  sniffImageMime,
  validateImageUrl,
} from "./imageUrl";
import { isTrustedSender } from "./security";
import { WorkspaceError } from "./workspace/paths";
import { toResult } from "./workspace/result";

import type { FetchedImage } from "./workspace/types";

const TIMEOUT_MS = 20000;
const fail = (msg: string) => new WorkspaceError("INVALID_OPERATION", msg);

export const downloadImage = async (rawUrl: unknown): Promise<FetchedImage> => {
  const check = validateImageUrl(rawUrl);
  if (!check.ok) {
    throw fail(check.error);
  }

  let res: Response;
  try {
    res = await net.fetch(check.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "image/*,*/*;q=0.5" },
    });
  } catch (e: any) {
    throw fail(
      e?.name === "TimeoutError" || e?.name === "AbortError"
        ? "El servidor tardó demasiado en responder."
        : "No se pudo conectar. Revisá la dirección y tu conexión a internet.",
    );
  }

  // tras las redirecciones, el destino final también debe ser http(s) válido
  if (!validateImageUrl(res.url || check.url).ok) {
    throw fail("La dirección final no es válida.");
  }
  if (!res.ok) {
    throw fail(`El servidor respondió con error (${res.status}).`);
  }
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
    throw fail("La imagen pesa más de 15 MB.");
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    const reader = res.body?.getReader();
    if (!reader) {
      throw fail("El servidor no envió datos.");
    }
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw fail("La imagen pesa más de 15 MB.");
      }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof WorkspaceError) {
      throw e;
    }
    throw fail("Se cortó la descarga. Probá de nuevo.");
  }

  const bytes = Buffer.concat(chunks);
  // el tipo se decide por el contenido, no por lo que diga el servidor
  const mimeType = sniffImageMime(bytes);
  if (!mimeType) {
    throw fail(
      "La dirección no es una imagen compatible (PNG, JPG, GIF, WebP, SVG, BMP o AVIF).",
    );
  }
  return {
    mimeType,
    base64: bytes.toString("base64"),
    bytes: bytes.length,
    name: nameFromUrl(check.url),
  };
};

export const registerImageIpc = (devUrl: string | null) => {
  ipcMain.handle(IPC_CHANNELS.fetchImage, async (event, url: unknown) => {
    if (!isTrustedSender(event.senderFrame?.url ?? "", devUrl)) {
      return {
        ok: false,
        error: { code: "INVALID_OPERATION", message: "Origen no autorizado." },
      };
    }
    return toResult(() => downloadImage(url));
  });
};
