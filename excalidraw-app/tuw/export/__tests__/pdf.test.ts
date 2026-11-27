import { deflateSync, inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { buildPdf, pageSizeFor } from "../pdf";

const latin1 = (b: Uint8Array) => Buffer.from(b).toString("latin1");

describe("buildPdf", () => {
  const rgb = Buffer.alloc(4 * 3 * 3, 200); // 4×3 px
  const flate = new Uint8Array(deflateSync(rgb));
  const pdf = buildPdf({
    widthPx: 4,
    heightPx: 3,
    pageWidthPt: 300,
    pageHeightPt: 225.5,
    flate,
  });
  const text = latin1(pdf);

  it("tiene cabecera, fin de archivo y una página con el tamaño pedido", () => {
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/MediaBox [0 0 300 225.5]");
    expect(text).toContain("/Count 1");
  });

  it("la tabla xref apunta a cada objeto", () => {
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe("xref");
    const rows = text
      .slice(start)
      .split("\n")
      .filter((l) => /^\d{10} 00000 n/.test(l));
    expect(rows).toHaveLength(5);
    rows.forEach((row, i) => {
      const at = Number(row.slice(0, 10));
      expect(text.slice(at, at + `${i + 1} 0 obj`.length)).toBe(
        `${i + 1} 0 obj`,
      );
    });
  });

  it("la imagen va intacta y con su largo declarado", () => {
    expect(text).toContain(`/Length ${flate.length} >>\nstream\n`);
    const from = Buffer.from(pdf).indexOf("stream\n") + 7;
    const body = Buffer.from(pdf.subarray(from, from + flate.length));
    expect(inflateSync(body).equals(rgb)).toBe(true);
  });
});

describe("pageSizeFor", () => {
  it("1 px de hoja = 0,75 pt (96 ppp), sin contar la escala del PNG", () => {
    const { w, h } = pageSizeFor(2000, 1000, 2);
    expect(w).toBeCloseTo(750);
    expect(h).toBeCloseTo(375);
  });

  it("no pasa el máximo de un PDF", () => {
    const { w, h } = pageSizeFor(60000, 30000, 1);
    expect(Math.max(w, h)).toBeLessThanOrEqual(14400);
    expect(w / h).toBeCloseTo(2);
  });
});
