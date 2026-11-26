/**
 * Convierte LaTeX en una imagen SVG autocontenida (usa KaTeX, que se carga solo cuando hace falta).
 * La parte "pura" del armado vive en latexSvg.ts (con tests); acá solo está lo que necesita el navegador.
 */
import {
  KATEX_FONTS,
  LAYOUT_CSS,
  buildLatexSvg,
  fontFaceRule,
  pickFontFiles,
  stripFontFaces,
  svgToBase64DataUrl,
  toXhtml,
} from "./latexSvg";

import type { LatexData } from "./latexSvg";

const FONT_LOADERS: Record<string, () => Promise<{ default: string }>> = {
  "Main-Regular": () =>
    import("katex/dist/fonts/KaTeX_Main-Regular.woff2?inline"),
  "Main-Bold": () => import("katex/dist/fonts/KaTeX_Main-Bold.woff2?inline"),
  "Main-Italic": () =>
    import("katex/dist/fonts/KaTeX_Main-Italic.woff2?inline"),
  "Main-BoldItalic": () =>
    import("katex/dist/fonts/KaTeX_Main-BoldItalic.woff2?inline"),
  "Math-Italic": () =>
    import("katex/dist/fonts/KaTeX_Math-Italic.woff2?inline"),
  "Math-BoldItalic": () =>
    import("katex/dist/fonts/KaTeX_Math-BoldItalic.woff2?inline"),
  "AMS-Regular": () =>
    import("katex/dist/fonts/KaTeX_AMS-Regular.woff2?inline"),
  "Caligraphic-Regular": () =>
    import("katex/dist/fonts/KaTeX_Caligraphic-Regular.woff2?inline"),
  "Caligraphic-Bold": () =>
    import("katex/dist/fonts/KaTeX_Caligraphic-Bold.woff2?inline"),
  "Fraktur-Regular": () =>
    import("katex/dist/fonts/KaTeX_Fraktur-Regular.woff2?inline"),
  "Fraktur-Bold": () =>
    import("katex/dist/fonts/KaTeX_Fraktur-Bold.woff2?inline"),
  "SansSerif-Regular": () =>
    import("katex/dist/fonts/KaTeX_SansSerif-Regular.woff2?inline"),
  "SansSerif-Bold": () =>
    import("katex/dist/fonts/KaTeX_SansSerif-Bold.woff2?inline"),
  "SansSerif-Italic": () =>
    import("katex/dist/fonts/KaTeX_SansSerif-Italic.woff2?inline"),
  "Script-Regular": () =>
    import("katex/dist/fonts/KaTeX_Script-Regular.woff2?inline"),
  "Typewriter-Regular": () =>
    import("katex/dist/fonts/KaTeX_Typewriter-Regular.woff2?inline"),
  "Size1-Regular": () =>
    import("katex/dist/fonts/KaTeX_Size1-Regular.woff2?inline"),
  "Size2-Regular": () =>
    import("katex/dist/fonts/KaTeX_Size2-Regular.woff2?inline"),
  "Size3-Regular": () =>
    import("katex/dist/fonts/KaTeX_Size3-Regular.woff2?inline"),
  "Size4-Regular": () =>
    import("katex/dist/fonts/KaTeX_Size4-Regular.woff2?inline"),
};

const PADDING = 6;
const MAX_SOURCE = 5000;

let assetsPromise: Promise<{
  katex: typeof import("katex").default;
  css: string;
}> | null = null;

const loadKatex = () => {
  assetsPromise ??= Promise.all([
    import("katex"),
    import("katex/dist/katex.min.css?raw"),
  ]).then(([k, css]) => ({
    katex: k.default,
    css: stripFontFaces(css.default),
  }));
  return assetsPromise;
};

const fontCache = new Map<string, Promise<string>>();
const loadFont = (file: string): Promise<string> => {
  let p = fontCache.get(file);
  if (!p) {
    const loader = FONT_LOADERS[file];
    p = loader
      ? loader().then((m) => m.default)
      : Promise.reject(new Error(`Tipografía desconocida: ${file}`));
    fontCache.set(file, p);
  }
  return p;
};

/** Para medir la fórmula la página necesita tener las mismas tipografías y estilos. */
const installedFonts = new Set<string>();
const installInDocument = async (files: string[], css: string) => {
  let style = document.getElementById(
    "tuw-katex-measure",
  ) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "tuw-katex-measure";
    style.textContent = `${css}
${LAYOUT_CSS}`;
    document.head.appendChild(style);
  }
  for (const file of files) {
    if (installedFonts.has(file)) {
      continue;
    }
    const font = KATEX_FONTS.find((x) => x.file === file)!;
    style.textContent += `\n${fontFaceRule(font, await loadFont(file))}`;
    installedFonts.add(file);
  }
  await Promise.all(
    files.map((file) => {
      const font = KATEX_FONTS.find((x) => x.file === file)!;
      return document.fonts
        .load(`${font.style} ${font.weight} 20px ${font.family}`)
        .catch(() => null);
    }),
  );
};

const measure = (html: string, fontSize: number) => {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-100000px;top:0;visibility:hidden;display:inline-block;white-space:nowrap;line-height:normal;font-size:${fontSize}px;`;
  host.innerHTML = html;
  document.body.appendChild(host);
  const r = host.getBoundingClientRect();
  host.remove();
  return { width: Math.ceil(r.width), height: Math.ceil(r.height) };
};

export type LatexRender =
  | {
      ok: true;
      /** SVG listo para guardar (data-URL base64). */
      dataURL: string;
      /** Tamaño natural de la imagen, en unidades de la hoja. */
      width: number;
      height: number;
    }
  | { ok: false; error: string };

export const renderLatex = async (spec: LatexData): Promise<LatexRender> => {
  const source = spec.source.trim();
  if (!source) {
    return { ok: false, error: "Escribí una fórmula." };
  }
  if (source.length > MAX_SOURCE) {
    return { ok: false, error: "La fórmula es demasiado larga." };
  }
  const { katex, css } = await loadKatex();

  let html: string;
  try {
    html = katex.renderToString(source, {
      output: "html",
      displayMode: spec.displayMode,
      throwOnError: true,
      trust: false,
      strict: "ignore",
      maxExpand: 1000,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e).replace(/^KaTeX parse error:\s*/, "");
    return { ok: false, error: msg };
  }

  const files = pickFontFiles(html);
  await installInDocument(files, css);
  const { width, height } = measure(html, spec.fontSize);
  const fontFaces = await Promise.all(
    files.map(async (file) =>
      fontFaceRule(
        KATEX_FONTS.find((x) => x.file === file)!,
        await loadFont(file),
      ),
    ),
  );
  const svg = buildLatexSvg({
    xhtml: toXhtml(html),
    css,
    fontFaces,
    width,
    height,
    fontSize: spec.fontSize,
    color: spec.color,
    padding: PADDING,
  });
  return {
    ok: true,
    dataURL: svgToBase64DataUrl(svg),
    width: width + PADDING * 2,
    height: height + PADDING * 2,
  };
};
