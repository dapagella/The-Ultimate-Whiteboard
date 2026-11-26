/**
 * Lógica de seguridad del proceso principal. Es PURA (sin importar `electron`)
 * para poder probarla con vitest.
 */
import { createHash } from "node:crypto";
import path from "node:path";

/** Esquema propio con el que se sirve la app empaquetada: tuw://app/... */
export const APP_SCHEME = "tuw";
export const APP_HOST = "app";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/**
 * Convierte la URL pedida por la ventana en una ruta de archivo DENTRO de
 * `rootDir`. Devuelve null si el origen no es el de la app o si la ruta
 * intenta salir de `rootDir` (`..`, rutas codificadas, barras invertidas…).
 */
export const resolveAppFile = (
  rootDir: string,
  requestUrl: string,
): string | null => {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) {
    return null;
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\0") || pathname.includes("\\")) {
    return null;
  }
  if (pathname === "/" || pathname === "") {
    pathname = "/index.html";
  }

  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, `.${pathname}`);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }
  return resolved;
};

/**
 * Content-Security-Policy estricta para la app empaquetada. Los scripts en
 * línea del index.html se permiten por hash (no por 'unsafe-inline').
 */
export const buildCsp = (indexHtml: string): string => {
  const hashes: string[] = [];
  const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(indexHtml))) {
    const body = m[1];
    if (body.trim()) {
      hashes.push(
        `'sha256-${createHash("sha256")
          .update(body, "utf8")
          .digest("base64")}'`,
      );
    }
  }
  return [
    "default-src 'none'",
    `script-src 'self' 'wasm-unsafe-eval' ${hashes.join(" ")}`.trim(),
    // Excalidraw inyecta estilos en línea
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data: blob:",
    "connect-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "media-src 'self' data: blob:",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
};

/**
 * ¿La ventana puede navegar a esta URL? Solo dentro de la propia app (o del
 * servidor de desarrollo). OJO: en Node `new URL("tuw://app").origin` es "null"
 * (esquema no estándar), por eso se compara esquema y host a mano.
 */
export const isAllowedNavigation = (
  url: string,
  devUrl?: string | null,
): boolean => {
  try {
    const u = new URL(url);
    if (u.protocol === `${APP_SCHEME}:` && u.host === APP_HOST) {
      return true;
    }
    if (devUrl && u.origin !== "null" && u.origin === new URL(devUrl).origin) {
      return true;
    }
  } catch {
    // URL inválida
  }
  return false;
};

/** Enlaces que sí se abren en el navegador del sistema: solo http(s). */
export const isSafeExternalUrl = (url: string): boolean => {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
};

/** Permisos del navegador que la app concede (todo lo demás se deniega). */
const ALLOWED_PERMISSIONS = new Set([
  "clipboard-read",
  "clipboard-sanitized-write",
]);
export const isAllowedPermission = (permission: string): boolean =>
  ALLOWED_PERMISSIONS.has(permission);

/** ¿El mensaje IPC viene de nuestra propia página? */
export const isTrustedSender = (
  senderUrl: string,
  devUrl?: string | null,
): boolean => isAllowedNavigation(senderUrl, devUrl);

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

/** Content-Type por extensión (importante para fuentes y WebAssembly). */
export const mimeTypeFor = (file: string): string =>
  MIME_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
