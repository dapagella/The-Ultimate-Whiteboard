import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  APP_ORIGIN,
  buildCsp,
  isAllowedNavigation,
  isAllowedPermission,
  isSafeExternalUrl,
  isTrustedSender,
  mimeTypeFor,
  resolveAppFile,
} from "../src/security";

const ROOT = path.resolve("/tmp/tuw-app");

describe("resolveAppFile", () => {
  it("mapea / a index.html y resuelve rutas dentro de la raíz", () => {
    expect(resolveAppFile(ROOT, `${APP_ORIGIN}/`)).toBe(
      path.join(ROOT, "index.html"),
    );
    expect(resolveAppFile(ROOT, `${APP_ORIGIN}/assets/a.js`)).toBe(
      path.join(ROOT, "assets", "a.js"),
    );
  });

  it("nunca devuelve una ruta fuera de la raíz (..)", () => {
    const inside = (r: string | null) =>
      r === null || r.startsWith(ROOT + path.sep);
    // el navegador normaliza "/../x" y "%2e%2e" a "/x": queda dentro de la raíz
    for (const u of [
      "/../secret.txt",
      "/%2e%2e/secret.txt",
      "/a/%2e%2e/%2e%2e/x",
      "/assets/../../x",
    ]) {
      expect(inside(resolveAppFile(ROOT, `${APP_ORIGIN}${u}`))).toBe(true);
    }
  });

  it("rechaza ..%2f codificado que sí escaparía de la raíz", () => {
    expect(
      resolveAppFile(ROOT, `${APP_ORIGIN}/assets/..%2f..%2fsecret`),
    ).toBeNull();
  });

  it("rechaza barras invertidas, bytes nulos y secuencias mal codificadas", () => {
    expect(resolveAppFile(ROOT, `${APP_ORIGIN}/a%5C..%5Cb`)).toBeNull();
    expect(resolveAppFile(ROOT, `${APP_ORIGIN}/a%00b`)).toBeNull();
    expect(resolveAppFile(ROOT, `${APP_ORIGIN}/%E0%A4%A`)).toBeNull();
  });

  it("rechaza otros esquemas y otros hosts", () => {
    expect(resolveAppFile(ROOT, "file:///etc/passwd")).toBeNull();
    expect(resolveAppFile(ROOT, "https://example.com/index.html")).toBeNull();
    expect(resolveAppFile(ROOT, "tuw://otro/index.html")).toBeNull();
    expect(resolveAppFile(ROOT, "no es una url")).toBeNull();
  });
});

describe("buildCsp", () => {
  const html = `<html><script>var a = 1;</script><script src="x.js"></script><script type="module" src="/i.js"></script></html>`;
  const csp = buildCsp(html);

  it("permite solo los scripts en línea por hash", () => {
    expect(csp).toMatch(
      /script-src 'self' 'wasm-unsafe-eval' 'sha256-[A-Za-z0-9+/=]+'/,
    );
    expect(csp.match(/sha256-/g)).toHaveLength(1);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
  });

  it("bloquea red externa, objetos, frames y formularios", () => {
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'self' data: blob:");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toMatch(/https?:/);
  });
});

describe("navegación y enlaces", () => {
  it("solo permite navegar dentro de la app (y del servidor de desarrollo)", () => {
    expect(isAllowedNavigation(`${APP_ORIGIN}/algo`)).toBe(true);
    expect(isAllowedNavigation("https://evil.example/")).toBe(false);
    expect(isAllowedNavigation("file:///C:/Windows/System32")).toBe(false);
    expect(
      isAllowedNavigation("http://localhost:3001/", "http://localhost:3001"),
    ).toBe(true);
    expect(
      isAllowedNavigation("http://localhost:3002/", "http://localhost:3001"),
    ).toBe(false);
    expect(isAllowedNavigation("basura")).toBe(false);
  });

  it("abre afuera solo http(s)", () => {
    expect(isSafeExternalUrl("https://docs.excalidraw.com")).toBe(true);
    expect(isSafeExternalUrl("http://a.b")).toBe(true);
    expect(isSafeExternalUrl("file:///C:/x.exe")).toBe(false);
    expect(isSafeExternalUrl(["java", "script:alert(1)"].join(""))).toBe(false);
    expect(isSafeExternalUrl("ms-msdt:/id")).toBe(false);
    expect(isSafeExternalUrl("")).toBe(false);
  });
});

describe("permisos e IPC", () => {
  it("concede solo el portapapeles", () => {
    expect(isAllowedPermission("clipboard-read")).toBe(true);
    expect(isAllowedPermission("clipboard-sanitized-write")).toBe(true);
    for (const p of [
      "media",
      "geolocation",
      "notifications",
      "openExternal",
      "midi",
    ]) {
      expect(isAllowedPermission(p)).toBe(false);
    }
  });

  it("solo confía en mensajes de la propia página", () => {
    expect(isTrustedSender(`${APP_ORIGIN}/`)).toBe(true);
    expect(isTrustedSender("https://evil.example/")).toBe(false);
    expect(isTrustedSender("")).toBe(false);
  });
});

describe("mimeTypeFor", () => {
  it("devuelve el tipo correcto para fuentes, wasm y scripts", () => {
    expect(mimeTypeFor("a/b.woff2")).toBe("font/woff2");
    expect(mimeTypeFor("x.WASM")).toBe("application/wasm");
    expect(mimeTypeFor("i.js")).toContain("text/javascript");
    expect(mimeTypeFor("desconocido.xyz")).toBe("application/octet-stream");
  });
});
