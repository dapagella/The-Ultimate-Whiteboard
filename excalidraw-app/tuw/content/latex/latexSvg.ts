/**
 * Armado del SVG de una fórmula LaTeX (lógica PURA, sin cargar KaTeX: se prueba con vitest).
 *
 * KaTeX produce HTML + CSS. Para que la fórmula sea una imagen normal de la hoja (y se exporte a
 * PNG/SVG), se mete ese HTML dentro de un <foreignObject> de un SVG autocontenido: el CSS va
 * inline y SOLO las tipografías que la fórmula usa van incrustadas como data-URL.
 */

export type FontFile = {
  file: string; // p. ej. "Main-Regular"
  family: string;
  weight: 400 | 700;
  style: "normal" | "italic";
};

const f = (
  file: string,
  family: string,
  weight: 400 | 700 = 400,
  style: "normal" | "italic" = "normal",
): FontFile => ({ file, family, weight, style });

export const KATEX_FONTS: FontFile[] = [
  f("Main-Regular", "KaTeX_Main"),
  f("Main-Bold", "KaTeX_Main", 700),
  f("Main-Italic", "KaTeX_Main", 400, "italic"),
  f("Main-BoldItalic", "KaTeX_Main", 700, "italic"),
  f("Math-Italic", "KaTeX_Math", 400, "italic"),
  f("Math-BoldItalic", "KaTeX_Math", 700, "italic"),
  f("AMS-Regular", "KaTeX_AMS"),
  f("Caligraphic-Regular", "KaTeX_Caligraphic"),
  f("Caligraphic-Bold", "KaTeX_Caligraphic", 700),
  f("Fraktur-Regular", "KaTeX_Fraktur"),
  f("Fraktur-Bold", "KaTeX_Fraktur", 700),
  f("SansSerif-Regular", "KaTeX_SansSerif"),
  f("SansSerif-Bold", "KaTeX_SansSerif", 700),
  f("SansSerif-Italic", "KaTeX_SansSerif", 400, "italic"),
  f("Script-Regular", "KaTeX_Script"),
  f("Typewriter-Regular", "KaTeX_Typewriter"),
  f("Size1-Regular", "KaTeX_Size1"),
  f("Size2-Regular", "KaTeX_Size2"),
  f("Size3-Regular", "KaTeX_Size3"),
  f("Size4-Regular", "KaTeX_Size4"),
];

const classTokens = (html: string): Set<string> => {
  const out = new Set<string>();
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    for (const t of m[1].split(/\s+/)) {
      if (t) {
        out.add(t);
      }
    }
  }
  return out;
};

/** Tipografías de KaTeX que realmente usa este HTML (según las clases CSS que aparecen). */
export const pickFontFiles = (html: string): string[] => {
  const c = classTokens(html);
  const has = (...names: string[]) => names.some((n) => c.has(n));
  const out = new Set<string>(["Main-Regular"]);

  if (has("mathnormal")) {
    out.add("Math-Italic");
  }
  if (has("boldsymbol")) {
    out.add("Math-BoldItalic");
  }
  if (has("mathbf", "textbf", "mathboldfrak")) {
    out.add("Main-Bold");
  }
  if (has("mathit", "textit")) {
    out.add("Main-Italic");
  }
  if (has("mathbf", "textbf") && has("mathit", "textit")) {
    out.add("Main-BoldItalic");
  }
  if (has("amsrm", "mathbb", "textbb")) {
    out.add("AMS-Regular");
  }
  if (has("mathcal")) {
    out.add("Caligraphic-Regular");
  }
  if (has("mathfrak", "textfrak", "mathboldfrak", "textboldfrak")) {
    out.add("Fraktur-Regular");
    out.add("Fraktur-Bold");
  }
  if (has("mathscr", "textscr")) {
    out.add("Script-Regular");
  }
  if (
    has(
      "mathsf",
      "textsf",
      "mathboldsf",
      "textboldsf",
      "mathsfit",
      "mathitsf",
      "textitsf",
    )
  ) {
    out.add("SansSerif-Regular");
    out.add("SansSerif-Bold");
    out.add("SansSerif-Italic");
  }
  if (has("mathtt", "texttt")) {
    out.add("Typewriter-Regular");
  }
  if (has("size1", "delim-size1", "small-op")) {
    out.add("Size1-Regular");
  }
  if (has("size2", "large-op")) {
    out.add("Size2-Regular");
  }
  if (has("size3")) {
    out.add("Size3-Regular");
  }
  if (has("size4", "delim-size4")) {
    out.add("Size4-Regular");
  }
  return KATEX_FONTS.filter((x) => out.has(x.file)).map((x) => x.file);
};

/** Quita las reglas @font-face de la hoja de estilos de KaTeX (las tipografías se incrustan aparte). */
export const stripFontFaces = (css: string): string =>
  css.replace(/@font-face\s*\{[^}]*\}/g, "");

export const fontFaceRule = (font: FontFile, dataUrl: string): string =>
  `@font-face{font-family:${font.family};font-style:${font.style};font-weight:${font.weight};src:url(${dataUrl}) format("woff2");}`;

/** Ajustes que hacen que la fórmula mida lo mismo en el diálogo, en la hoja y al exportar. */
export const LAYOUT_CSS =
  ".katex-display{margin:0!important}.katex-display>.katex{white-space:nowrap}";

/** Pasa HTML (de KaTeX) a XHTML bien formado: dentro de un SVG todo debe ser XML válido. */
export const toXhtml = (html: string): string => {
  const doc = new DOMParser().parseFromString(
    `<div>${html}</div>`,
    "text/html",
  );
  const root = doc.body.firstElementChild!;
  return Array.from(root.childNodes)
    .map((n) => new XMLSerializer().serializeToString(n))
    .join("")
    .replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, "");
};

const cdata = (text: string) =>
  `<![CDATA[${text.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

export type LatexSvgInput = {
  /** HTML ya convertido con `toXhtml`. */
  xhtml: string;
  /** CSS de KaTeX SIN @font-face. */
  css: string;
  /** Reglas @font-face ya armadas (con data-URL). */
  fontFaces: string[];
  width: number;
  height: number;
  fontSize: number;
  color: string;
  /** Margen alrededor de la fórmula, en px. */
  padding: number;
};

const num = (n: number) => Math.round(n * 100) / 100;

export const buildLatexSvg = (i: LatexSvgInput): string => {
  const w = num(i.width + i.padding * 2);
  const h = num(i.height + i.padding * 2);
  const style = [...i.fontFaces, i.css, LAYOUT_CSS].join("\n");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<foreignObject x="0" y="0" width="${w}" height="${h}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;width:${w}px;height:${h}px;padding:${
      i.padding
    }px;font-size:${num(i.fontSize)}px;color:${
      i.color
    };line-height:normal;white-space:nowrap;">` +
    `<style>${cdata(style)}</style>${i.xhtml}</div></foreignObject></svg>`
  );
};

export const svgToDataUrl = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Igual que `svgToDataUrl` pero en base64: es el formato que guarda la hoja para sus imágenes. */
export const svgToBase64DataUrl = (svg: string): string => {
  const bytes = new TextEncoder().encode(svg);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:image/svg+xml;base64,${btoa(bin)}`;
};

/** Lo que se guarda en `customData.tuw.latex` de la imagen para poder editarla después. */
export type LatexData = {
  source: string;
  displayMode: boolean;
  fontSize: number;
  color: string;
};

export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 120;
export const DEFAULT_LATEX: LatexData = {
  source: "\\int_0^1 x^2\\,dx",
  displayMode: true,
  fontSize: 40,
  color: "#1e1e1e",
};

const HEX6 = /^#[0-9a-f]{6}$/i;

/** Lee y sanea `customData.tuw.latex` (un archivo de la hoja puede traer cualquier cosa). */
export const readLatexData = (customData: unknown): LatexData | null => {
  const raw = (customData as any)?.tuw?.latex;
  if (!raw || typeof raw !== "object" || typeof raw.source !== "string") {
    return null;
  }
  const size = Number(raw.fontSize);
  return {
    source: raw.source.slice(0, 5000),
    displayMode: raw.displayMode !== false,
    fontSize: Number.isFinite(size)
      ? Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size))
      : DEFAULT_LATEX.fontSize,
    color:
      typeof raw.color === "string" && HEX6.test(raw.color)
        ? raw.color
        : DEFAULT_LATEX.color,
  };
};
