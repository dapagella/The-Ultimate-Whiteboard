import { describe, expect, it } from "vitest";

import {
  nameFromUrl,
  resolveRedirect,
  sniffImageMime,
  validateImageUrl,
} from "../src/imageUrl";

const bytes = (...n: number[]) => new Uint8Array(n);
const text = (s: string) => new TextEncoder().encode(s);

describe("validateImageUrl", () => {
  it("acepta http y https y normaliza", () => {
    expect(validateImageUrl("  https://example.com/a.png  ")).toEqual({
      ok: true,
      url: "https://example.com/a.png",
    });
    expect(validateImageUrl("http://example.com/x?y=1")).toMatchObject({
      ok: true,
    });
  });

  it("rechaza otros esquemas peligrosos o inútiles", () => {
    for (const bad of [
      "file:///C:/Windows/win.ini",
      ["java", "script:alert(1)"].join(""),
      "ftp://x.com/a.png",
      "data:image/png;base64,AAAA",
      "blob:https://x/1",
      "chrome://settings",
    ]) {
      expect(validateImageUrl(bad).ok, bad).toBe(false);
    }
  });

  it("rechaza vacío, basura, credenciales en la dirección y largos excesivos", () => {
    for (const bad of [
      "",
      "   ",
      "no es url",
      "https://",
      "https://user:pass@example.com/a.png",
      `https://example.com/${"a".repeat(3000)}`,
      5,
      null,
      undefined,
    ]) {
      expect(validateImageUrl(bad as any).ok, String(bad)).toBe(false);
    }
  });
});

describe("resolveRedirect", () => {
  it("resuelve rutas relativas y vuelve a validar", () => {
    expect(resolveRedirect("https://a.com/x/y.png", "/z.png")).toEqual({
      ok: true,
      url: "https://a.com/z.png",
    });
    expect(resolveRedirect("https://a.com/x", "https://b.com/i.png")).toEqual({
      ok: true,
      url: "https://b.com/i.png",
    });
  });

  it("no sigue redirecciones a esquemas no permitidos ni sin destino", () => {
    expect(resolveRedirect("https://a.com/x", "file:///etc/passwd").ok).toBe(
      false,
    );
    expect(resolveRedirect("https://a.com/x", null).ok).toBe(false);
  });
});

describe("sniffImageMime (por bytes, no por lo que diga el servidor)", () => {
  it("reconoce los formatos del editor", () => {
    expect(
      sniffImageMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)),
    ).toBe("image/png");
    expect(sniffImageMime(bytes(0xff, 0xd8, 0xff, 0xe0, 0))).toBe("image/jpeg");
    expect(sniffImageMime(text("GIF89a...."))).toBe("image/gif");
    expect(sniffImageMime(bytes(0x42, 0x4d, 1, 2, 3, 4))).toBe("image/bmp");
    expect(
      sniffImageMime(
        new Uint8Array([...text("RIFF"), 0, 0, 0, 0, ...text("WEBP")]),
      ),
    ).toBe("image/webp");
    expect(
      sniffImageMime(new Uint8Array([0, 0, 0, 0x1c, ...text("ftypavif")])),
    ).toBe("image/avif");
  });

  it("reconoce SVG (con o sin cabecera XML, comentarios o BOM)", () => {
    expect(
      sniffImageMime(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    ).toBe("image/svg+xml");
    expect(
      sniffImageMime(
        text('<?xml version="1.0"?>\n<!-- hola -->\n<svg width="1"></svg>'),
      ),
    ).toBe("image/svg+xml");
    expect(sniffImageMime(text('\uFEFF  <svg viewBox="0 0 1 1"/>'))).toBe(
      "image/svg+xml",
    );
  });

  it("rechaza HTML, texto, ejecutables y archivos vacíos o muy cortos", () => {
    expect(
      sniffImageMime(text("<html><body>no soy una imagen</body></html>")),
    ).toBeNull();
    expect(sniffImageMime(text("<!DOCTYPE html><svg>"))).toBeNull();
    expect(sniffImageMime(text("MZ\u0090\u0000 programa"))).toBeNull();
    expect(sniffImageMime(text("hola mundo"))).toBeNull();
    expect(sniffImageMime(bytes())).toBeNull();
    expect(sniffImageMime(bytes(1, 2))).toBeNull();
  });

  it("un servidor que miente (dice image/png pero manda HTML) no engaña", () => {
    expect(sniffImageMime(text("<html></html>"))).toBeNull();
  });
});

describe("nameFromUrl", () => {
  it("toma el último tramo de la ruta, sin parámetros", () => {
    expect(nameFromUrl("https://x.com/a/b%20c.png?v=1")).toBe("b c.png");
    expect(nameFromUrl("https://x.com/")).toBe("imagen");
    expect(nameFromUrl("no url")).toBe("imagen");
  });
});
