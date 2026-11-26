import katex from "katex";
import { describe, expect, it } from "vitest";

import { fitSize } from "../size";
import {
  DEFAULT_LATEX,
  KATEX_FONTS,
  buildLatexSvg,
  fontFaceRule,
  pickFontFiles,
  readLatexData,
  stripFontFaces,
  svgToDataUrl,
  toXhtml,
} from "../latex/latexSvg";

const html = (tex: string) =>
  katex.renderToString(tex, {
    output: "html",
    displayMode: true,
    throwOnError: false,
  });

describe("pickFontFiles (solo las tipografías que la fórmula usa)", () => {
  it("la integral de ejemplo usa Main, Math y el símbolo grande (Size2)", () => {
    const files = pickFontFiles(html("\\int_0^1 x^2\\,dx"));
    expect(files).toContain("Main-Regular");
    expect(files).toContain("Math-Italic");
    expect(files).toContain("Size2-Regular");
    expect(files).not.toContain("Fraktur-Regular");
    expect(files).not.toContain("Script-Regular");
  });

  it("detecta estilos especiales", () => {
    expect(pickFontFiles(html("\\mathbb{R}"))).toContain("AMS-Regular");
    expect(pickFontFiles(html("\\mathcal{L}"))).toContain(
      "Caligraphic-Regular",
    );
    expect(pickFontFiles(html("\\mathbf{v}"))).toContain("Main-Bold");
    expect(pickFontFiles(html("\\mathfrak{g}"))).toContain("Fraktur-Regular");
    expect(pickFontFiles(html("\\mathtt{x}"))).toContain("Typewriter-Regular");
    expect(pickFontFiles(html("\\mathsf{x}"))).toContain("SansSerif-Regular");
  });

  it("una fórmula simple no arrastra tipografías de más", () => {
    const files = pickFontFiles(html("1+2"));
    expect(files).toEqual(["Main-Regular"]);
  });

  it("todo lo que devuelve existe en la tabla de tipografías", () => {
    const known = new Set(KATEX_FONTS.map((x) => x.file));
    const files = pickFontFiles(
      html("\\left(\\sum_{i=1}^n \\mathbb{R}\\mathcal{A}\\mathbf{b}\\right)"),
    );
    for (const f of files) {
      expect(known.has(f), f).toBe(true);
    }
  });
});

describe("stripFontFaces", () => {
  it("quita solo las reglas @font-face", () => {
    const css =
      "@font-face{font-family:A;src:url(x.woff2)}.katex{color:red}@font-face{font-family:B;src:url(y)}.a>.b{margin:0}";
    expect(stripFontFaces(css)).toBe(".katex{color:red}.a>.b{margin:0}");
  });
});

describe("buildLatexSvg", () => {
  const xhtml = toXhtml(html("x^2 < 3 \\& y"));
  const svg = buildLatexSvg({
    xhtml,
    css: ".katex .a>.b{color:red}",
    fontFaces: [fontFaceRule(KATEX_FONTS[0], "data:font/woff2;base64,AAAA")],
    width: 100,
    height: 40,
    fontSize: 30,
    color: "#336699",
    padding: 4,
  });

  it("es XML válido (se puede abrir como imagen)", () => {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    const root = doc.documentElement;
    expect(root.getAttribute("width")).toBe("108");
    expect(root.getAttribute("height")).toBe("48");
    expect(root.getAttribute("viewBox")).toBe("0 0 108 48");
  });

  it("lleva dentro la fórmula, el color, el tamaño y la tipografía incrustada", () => {
    expect(svg).toContain("<foreignObject");
    expect(svg).toContain("color:#336699");
    expect(svg).toContain("font-size:30px");
    expect(svg).toContain("data:font/woff2;base64,AAAA");
    expect(svg).toContain('class="katex"');
  });

  it("no pide recursos externos (todo va incrustado)", () => {
    expect(svg).not.toMatch(/url\(\s*['"]?https?:/);
    expect(svg).not.toMatch(/<script/i);
  });

  it("el data-URL se puede decodificar de vuelta", () => {
    const url = svgToDataUrl(svg);
    expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(url.split(",").slice(1).join(","))).toBe(svg);
  });

  it("un CSS con ']]>' no rompe el CDATA", () => {
    const out = buildLatexSvg({
      xhtml: "<span>a</span>",
      css: "/* ]]> */.x{color:red}",
      fontFaces: [],
      width: 10,
      height: 10,
      fontSize: 10,
      color: "#000000",
      padding: 0,
    });
    const doc = new DOMParser().parseFromString(out, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
  });
});

describe("toXhtml", () => {
  it("convierte el HTML de KaTeX en XML bien formado (SVG interno, entidades)", () => {
    const x = toXhtml(html("\\sqrt{x}\\ \\le\\ a<b"));
    const doc = new DOMParser().parseFromString(
      `<r xmlns="http://www.w3.org/1999/xhtml">${x}</r>`,
      "application/xml",
    );
    expect(doc.querySelector("parsererror")).toBeNull();
  });
});

describe("readLatexData", () => {
  it("lee datos válidos", () => {
    const d = readLatexData({
      tuw: {
        latex: {
          source: "x",
          displayMode: false,
          fontSize: 50,
          color: "#ff0000",
        },
      },
    });
    expect(d).toEqual({
      source: "x",
      displayMode: false,
      fontSize: 50,
      color: "#ff0000",
    });
  });

  it("sanea valores raros de un archivo manipulado", () => {
    const d = readLatexData({
      tuw: { latex: { source: "x", fontSize: 99999, color: "red;evil" } },
    })!;
    expect(d.fontSize).toBe(120);
    expect(d.color).toBe(DEFAULT_LATEX.color);
    expect(d.displayMode).toBe(true);
  });

  it("devuelve null si no es una fórmula", () => {
    expect(readLatexData(undefined)).toBeNull();
    expect(readLatexData({ tuw: { kind: "axis" } })).toBeNull();
    expect(readLatexData({ tuw: { latex: { source: 5 } } })).toBeNull();
  });
});

describe("fitSize", () => {
  it("reduce manteniendo la proporción y nunca agranda", () => {
    expect(fitSize(2000, 1000, 500)).toEqual({ width: 500, height: 250 });
    expect(fitSize(100, 50, 500)).toEqual({ width: 100, height: 50 });
    expect(fitSize(300, 900, 450)).toEqual({ width: 150, height: 450 });
  });

  it("tamaños inválidos no rompen", () => {
    expect(fitSize(0, 0, 400)).toEqual({ width: 400, height: 400 });
    expect(fitSize(NaN, 10, 400)).toEqual({ width: 400, height: 400 });
  });
});
