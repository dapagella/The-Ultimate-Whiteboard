/**
 * Validación de URLs de imágenes y detección del tipo real del archivo.
 * Lógica PURA (sin Electron): se prueba con vitest.
 */

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_REDIRECTS = 5;
const MAX_URL_LENGTH = 2048;

export type UrlCheck = { ok: true; url: string } | { ok: false; error: string };

/** Solo http(s), sin usuario/contraseña en la dirección, de largo razonable. */
export const validateImageUrl = (raw: unknown): UrlCheck => {
  if (typeof raw !== "string") {
    return { ok: false, error: "Escribí una dirección web." };
  }
  const text = raw.trim();
  if (!text) {
    return { ok: false, error: "Escribí una dirección web." };
  }
  if (text.length > MAX_URL_LENGTH) {
    return { ok: false, error: "La dirección es demasiado larga." };
  }
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return {
      ok: false,
      error: "La dirección no es válida (empezá con https://).",
    };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return {
      ok: false,
      error: "Solo se aceptan direcciones http:// o https://.",
    };
  }
  if (u.username || u.password) {
    return {
      ok: false,
      error: "La dirección no puede llevar usuario ni contraseña.",
    };
  }
  if (!u.hostname) {
    return { ok: false, error: "La dirección no es válida." };
  }
  return { ok: true, url: u.toString() };
};

/** Resuelve la cabecera `Location` de una redirección y la vuelve a validar. */
export const resolveRedirect = (
  current: string,
  location: string | null,
): UrlCheck => {
  if (!location) {
    return { ok: false, error: "El servidor redirigió sin indicar a dónde." };
  }
  try {
    return validateImageUrl(new URL(location, current).toString());
  } catch {
    return { ok: false, error: "Redirección inválida." };
  }
};

const startsWith = (b: Uint8Array, sig: number[], offset = 0) =>
  sig.every((v, i) => b[offset + i] === v);

const SVG_START =
  /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE\s+svg[^>]*>\s*)?<svg[\s>]/i;

/**
 * Tipo de imagen según los PRIMEROS BYTES (no se confía en el `Content-Type` del servidor).
 * Devuelve null si no es un formato que el editor acepta.
 */
export const sniffImageMime = (bytes: Uint8Array): string | null => {
  if (bytes.length < 4) {
    return null;
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  if (startsWith(bytes, [0x42, 0x4d])) {
    return "image/bmp";
  }
  if (bytes.length >= 12 && startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    if (brand === "avif" || brand === "avis") {
      return "image/avif";
    }
  }
  const head = new TextDecoder("utf-8")
    .decode(bytes.slice(0, 1024))
    .replace(/^﻿/, "");
  if (SVG_START.test(head)) {
    return "image/svg+xml";
  }
  return null;
};

/** Nombre sugerido a partir de la dirección ("https://x.com/a/b%20c.png?v=1" → "b c.png"). */
export const nameFromUrl = (url: string): string => {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(last).slice(0, 80) || "imagen";
  } catch {
    return "imagen";
  }
};
