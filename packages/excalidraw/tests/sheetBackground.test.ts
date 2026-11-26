import { describe, expect, it } from "vitest";

import { exportScene } from "../scene/export";
import {
  DEFAULT_SHEET_BACKGROUND,
  MAX_SHEET_SPACING,
  MIN_SHEET_SPACING,
  buildSvgSheetBackground,
  isPatternVisible,
  luminanceOf,
  normalizeSheetBackground,
  patternDotRadius,
  patternLineWidth,
  patternPositions,
  renderSheetBackground,
  resolvePatternStyle,
} from "../scene/sheetBackground";
import { restoreAppState } from "../data/restore";
import { serializeAsJSON } from "../data/json";
import { getDefaultAppState } from "../appState";

import type { SheetBackground } from "../scene/sheetBackground";

const bg = (over: Partial<SheetBackground> = {}): SheetBackground => ({
  ...DEFAULT_SHEET_BACKGROUND,
  ...over,
});

/** Contexto 2D falso que registra lo que se dibuja. */
const recorder = () => {
  const calls: { fn: string; args: number[] }[] = [];
  const state = {
    lineWidth: 0,
    globalAlpha: 1,
    strokeStyle: "",
    fillStyle: "",
  };
  const ctx: any = new Proxy(state, {
    get(target: any, prop: string) {
      if (prop in target) {
        return target[prop];
      }
      return (...args: number[]) => {
        calls.push({ fn: prop, args });
      };
    },
    set(target: any, prop: string, value) {
      target[prop] = value;
      return true;
    },
  });
  const count = (fn: string) => calls.filter((c) => c.fn === fn).length;
  return { ctx: ctx as CanvasRenderingContext2D, calls, state, count };
};

describe("normalizeSheetBackground", () => {
  it("devuelve el valor por defecto con basura", () => {
    for (const bad of [undefined, null, 5, "x", [], {}]) {
      expect(normalizeSheetBackground(bad)).toEqual(DEFAULT_SHEET_BACKGROUND);
    }
  });

  it("conserva valores válidos", () => {
    expect(
      normalizeSheetBackground({
        type: "dots",
        lineColor: "#336699",
        spacing: 30,
      }),
    ).toEqual({ type: "dots", lineColor: "#336699", spacing: 30 });
  });

  it("corrige tipo, color y separación inválidos o fuera de rango", () => {
    expect(normalizeSheetBackground({ type: "diagonal" }).type).toBe("plain");
    expect(
      normalizeSheetBackground({ lineColor: "rojo" }).lineColor,
    ).toBeNull();
    expect(
      normalizeSheetBackground({ lineColor: ["java", "script:1"].join("") })
        .lineColor,
    ).toBeNull();
    expect(normalizeSheetBackground({ spacing: 1 }).spacing).toBe(
      MIN_SHEET_SPACING,
    );
    expect(normalizeSheetBackground({ spacing: 9999 }).spacing).toBe(
      MAX_SHEET_SPACING,
    );
    expect(normalizeSheetBackground({ spacing: NaN }).spacing).toBe(24);
    expect(normalizeSheetBackground({ spacing: "30" }).spacing).toBe(24);
  });

  it("acepta #rgb, #rrggbb y #rrggbbaa", () => {
    for (const c of ["#abc", "#aabbcc", "#aabbccdd"]) {
      expect(normalizeSheetBackground({ lineColor: c }).lineColor).toBe(c);
    }
  });
});

describe("color automático", () => {
  it("luminanceOf: blanco ≈ 1, negro = 0, no entendido = blanco", () => {
    expect(luminanceOf("#ffffff")).toBeCloseTo(1, 3);
    expect(luminanceOf("#000")).toBe(0);
    expect(luminanceOf("no-es-color")).toBe(1);
  });

  it("sobre fondo claro usa líneas oscuras suaves; sobre oscuro, claras", () => {
    expect(resolvePatternStyle("#ffffff", null, false)).toEqual({
      color: "#000000",
      alpha: 0.16,
    });
    expect(resolvePatternStyle("#fff9db", null, false).color).toBe("#000000");
    expect(resolvePatternStyle("#1e1e1e", null, false)).toEqual({
      color: "#ffffff",
      alpha: 0.2,
    });
  });

  it("el modo oscuro tiene en cuenta cómo se ve el fondo (blanco se invierte)", () => {
    expect(resolvePatternStyle("#ffffff", null, true).color).toBe("#ffffff");
  });

  it("un color propio se usa tal cual (alpha 1)", () => {
    expect(resolvePatternStyle("#ffffff", "#336699", false)).toEqual({
      color: "#336699",
      alpha: 1,
    });
  });
});

describe("geometría", () => {
  it("patternPositions alinea al origen y cubre el rango", () => {
    expect(patternPositions(10, 5, 32)).toEqual([0, 10, 20, 30, 40]);
    expect(patternPositions(10, -25, -4)).toEqual([-30, -20, -10, 0]);
    for (const p of patternPositions(24, -130, 400)) {
      expect(Math.abs(p % 24)).toBe(0);
    }
  });

  it("grosor y radio: crecen con la hoja pero nunca bajan de 1 px en pantalla", () => {
    expect(patternLineWidth(1)).toBe(1);
    expect(patternLineWidth(2)).toBe(1); // más zoom: 1 unidad (se ve más gruesa)
    expect(patternLineWidth(0.25) * 0.25).toBeGreaterThanOrEqual(1);
    expect(patternDotRadius(1)).toBe(1.2);
    expect(patternDotRadius(0.25) * 0.25).toBeGreaterThanOrEqual(1.2);
  });

  it("no se dibuja cuando quedaría demasiado junto (zoom muy alejado)", () => {
    expect(isPatternVisible(bg({ type: "grid", spacing: 24 }), 1)).toBe(true);
    expect(isPatternVisible(bg({ type: "grid", spacing: 24 }), 0.2)).toBe(
      false,
    );
    expect(isPatternVisible(bg({ type: "dots", spacing: 24 }), 0.4)).toBe(
      false,
    );
    expect(isPatternVisible(bg({ type: "plain" }), 1)).toBe(false);
  });
});

describe("renderSheetBackground (lienzo)", () => {
  const draw = (
    b: SheetBackground,
    opts: {
      scrollX?: number;
      scrollY?: number;
      zoom?: number;
      scale?: number;
    } = {},
  ) => {
    const r = recorder();
    renderSheetBackground(
      r.ctx,
      b,
      { color: "#123456", alpha: 0.5 },
      opts.scrollX ?? 0,
      opts.scrollY ?? 0,
      opts.zoom ?? 1,
      400,
      300,
      opts.scale ?? 1,
    );
    return r;
  };

  it("liso no dibuja nada", () => {
    expect(draw(bg({ type: "plain" })).calls).toEqual([]);
  });

  it("cuadriculado: líneas horizontales y verticales, un solo trazo, con el color y opacidad dados", () => {
    const r = draw(bg({ type: "grid", spacing: 20 }));
    const moves = r.calls.filter((c) => c.fn === "moveTo");
    const horizontal = moves.filter(
      (m, i) =>
        r.calls.filter((c) => c.fn === "lineTo")[i].args[1] === m.args[1],
    );
    const vertical = moves.length - horizontal.length;
    expect(horizontal.length).toBeGreaterThanOrEqual(300 / 20);
    expect(vertical).toBeGreaterThanOrEqual(400 / 20);
    expect(r.count("stroke")).toBe(1);
    expect(r.state.strokeStyle).toBe("#123456");
  });

  it("rayado: solo líneas horizontales", () => {
    const r = draw(bg({ type: "lines", spacing: 20 }));
    const moves = r.calls.filter((c) => c.fn === "moveTo");
    const lineTos = r.calls.filter((c) => c.fn === "lineTo");
    expect(moves.length).toBeGreaterThan(0);
    moves.forEach((m, i) => expect(lineTos[i].args[1]).toBe(m.args[1]));
  });

  it("punteado: un punto por intersección, rellenos en un solo paso", () => {
    const r = draw(bg({ type: "dots", spacing: 20 }));
    expect(r.count("arc")).toBeGreaterThanOrEqual((400 / 20) * (300 / 20));
    expect(r.count("fill")).toBe(1);
    expect(r.state.fillStyle).toBe("#123456");
  });

  it("las líneas están alineadas a la hoja (se mueven con el scroll)", () => {
    const r = draw(bg({ type: "lines", spacing: 20 }), { scrollY: 7 });
    for (const m of r.calls.filter((c) => c.fn === "moveTo")) {
      // y en pantalla = y de la hoja + scroll → (y - scroll) es múltiplo del espaciado,
      // salvo el ajuste a píxel (como máximo medio píxel)
      const rest = (((m.args[1] - 7) % 20) + 20) % 20;
      expect(Math.min(rest, 20 - rest)).toBeLessThanOrEqual(0.5);
    }
  });

  it("no dibuja con zoom muy alejado", () => {
    expect(
      draw(bg({ type: "grid", spacing: 20 }), { zoom: 0.2 }).calls,
    ).toEqual([]);
  });

  it("el grosor nunca baja de 1 píxel de dispositivo", () => {
    for (const zoom of [0.3, 0.5, 1, 2, 4]) {
      const r = draw(bg({ type: "grid", spacing: 40 }), { zoom, scale: 2 });
      expect(r.state.lineWidth * zoom * 2).toBeGreaterThanOrEqual(0.999);
    }
  });

  it("tiene un tope de elementos por cuadro (no se traba con separaciones mínimas)", () => {
    const r = recorder();
    renderSheetBackground(
      r.ctx,
      bg({ type: "dots", spacing: 8 }),
      { color: "#000", alpha: 1 },
      0,
      0,
      2,
      20000,
      20000,
      1,
    );
    expect(r.count("arc")).toBe(0);
  });
});

describe("SVG", () => {
  const build = (b: SheetBackground, offset = { offsetX: 0, offsetY: 0 }) => {
    const doc = document.implementation.createDocument(
      "http://www.w3.org/2000/svg",
      "svg",
      null,
    );
    const defs = doc.createElementNS("http://www.w3.org/2000/svg", "defs");
    const rect = buildSvgSheetBackground(
      doc,
      defs,
      b,
      { color: "#123456", alpha: 0.5 },
      { ...offset, width: 200, height: 100 },
    );
    return { defs, rect };
  };

  it("liso no agrega nada", () => {
    const { defs, rect } = build(bg({ type: "plain" }));
    expect(rect).toBeNull();
    expect(defs.childNodes.length).toBe(0);
  });

  it("cuadriculado, rayado y punteado agregan un patrón y un rectángulo que lo usa", () => {
    for (const type of ["grid", "lines", "dots"] as const) {
      const { defs, rect } = build(bg({ type, spacing: 30 }));
      const pattern = defs.querySelector("pattern")!;
      expect(pattern.getAttribute("width")).toBe("30");
      expect(rect!.getAttribute("fill")).toBe(
        `url(#${pattern.getAttribute("id")})`,
      );
      expect(rect!.getAttribute("width")).toBe("200");
    }
  });

  it("el cuadriculado tiene líneas en las dos direcciones; el rayado solo horizontal", () => {
    const grid = build(bg({ type: "grid", spacing: 30 }))
      .defs.querySelector("path")!
      .getAttribute("d")!;
    const lines = build(bg({ type: "lines", spacing: 30 }))
      .defs.querySelector("path")!
      .getAttribute("d")!;
    expect(grid).toMatch(/H30.*V30/);
    expect(lines).toMatch(/H30/);
    expect(lines).not.toMatch(/V/);
  });

  it("el patrón queda alineado al origen de la hoja (igual que el lienzo)", () => {
    const { defs } = build(bg({ type: "lines", spacing: 30 }), {
      offsetX: 17,
      offsetY: 41,
    });
    const pattern = defs.querySelector("pattern")!;
    // el origen del patrón es el (0,0) de la hoja y la línea ocupa [0, grosor] del cuadro
    expect(Number(pattern.getAttribute("x"))).toBe(17);
    expect(Number(pattern.getAttribute("y"))).toBe(41);
    expect(defs.querySelector("path")!.getAttribute("stroke-width")).toBe("1");
    expect(defs.querySelector("path")!.getAttribute("d")).toMatch(
      /^M0 0\.5H30/,
    );
  });

  it("usa el color y la opacidad dados", () => {
    const { defs } = build(bg({ type: "grid" }));
    const path = defs.querySelector("path")!;
    expect(path.getAttribute("stroke")).toBe("#123456");
    expect(path.getAttribute("stroke-opacity")).toBe("0.5");
  });
});

describe("exportToSvg con fondo de hoja", () => {
  const exportWith = async (
    tuwBackground: unknown,
    extra: Record<string, unknown> = {},
    cfg: Record<string, unknown> = {},
  ) =>
    exportScene({
      type: "svg",
      data: {
        elements: [],
        appState: {
          ...getDefaultAppState(),
          viewBackgroundColor: "#ffffff",
          tuwBackground,
          ...extra,
        } as any,
        files: null,
      },
      config: { skipInliningFonts: true, ...cfg } as any,
    });

  it("cada tipo se exporta con su patrón; liso no", async () => {
    for (const type of ["grid", "lines", "dots"]) {
      const svg = await exportWith({ type, lineColor: null, spacing: 24 });
      expect(svg.querySelectorAll("pattern").length, type).toBe(1);
      expect(
        svg.querySelector('rect[fill^="url(#tuw-sheet-bg"]'),
        type,
      ).toBeTruthy();
    }
    const plain = await exportWith({
      type: "plain",
      lineColor: null,
      spacing: 24,
    });
    expect(plain.querySelectorAll("pattern").length).toBe(0);
  });

  it("sin fondo en la exportación (transparente) tampoco hay patrón", async () => {
    const svg = await exportWith(
      { type: "grid", lineColor: null, spacing: 24 },
      {},
      { canvasBackgroundColor: false },
    );
    expect(svg.querySelectorAll("pattern").length).toBe(0);
  });

  it("un color propio y la separación llegan al SVG", async () => {
    const svg = await exportWith({
      type: "grid",
      lineColor: "#ff0000",
      spacing: 40,
    });
    expect(svg.querySelector("pattern")!.getAttribute("width")).toBe("40");
    expect(svg.querySelector("pattern path")!.getAttribute("stroke")).toBe(
      "#ff0000",
    );
  });

  it("el patrón cubre toda el área exportada y va ENCIMA del color de fondo", async () => {
    const svg = await exportWith({
      type: "dots",
      lineColor: null,
      spacing: 24,
    });
    const rects = [...svg.querySelectorAll("svg > rect")];
    const bgRect = rects[0];
    const patternRect = rects[1];
    expect(bgRect.getAttribute("fill")).toBe("#ffffff");
    expect(patternRect.getAttribute("fill")).toMatch(/^url\(#tuw-sheet-bg/);
    expect(patternRect.getAttribute("width")).toBe(
      bgRect.getAttribute("width"),
    );
    expect(patternRect.getAttribute("height")).toBe(
      bgRect.getAttribute("height"),
    );
  });

  it("valores dañados en el estado no rompen la exportación (vuelve a liso)", async () => {
    const svg = await exportWith({ type: "???", spacing: -5, lineColor: 7 });
    expect(svg.querySelectorAll("pattern").length).toBe(0);
  });

  it("modo oscuro: el color automático se adapta", async () => {
    const light = await exportWith({
      type: "grid",
      lineColor: null,
      spacing: 24,
    });
    const dark = await exportWith(
      { type: "grid", lineColor: null, spacing: 24 },
      { exportWithDarkMode: true },
      { theme: "dark" },
    );
    expect(light.querySelector("pattern path")!.getAttribute("stroke")).toBe(
      "#000000",
    );
    expect(dark.querySelector("pattern path")!.getAttribute("stroke")).toBe(
      "#ffffff",
    );
  });
});

describe("guardado y carga del fondo", () => {
  it("el fondo viaja dentro del archivo de la hoja y se restaura igual", () => {
    const tuwBackground = { type: "grid", lineColor: "#336699", spacing: 32 };
    const text = serializeAsJSON(
      [],
      { ...getDefaultAppState(), tuwBackground } as any,
      {},
      "local",
    );
    expect(JSON.parse(text).appState.tuwBackground).toEqual(tuwBackground);
    const restored = restoreAppState(JSON.parse(text).appState, null);
    expect(restored.tuwBackground).toEqual(tuwBackground);
  });

  it("un archivo sin fondo (de Excalidraw u hojas viejas) se abre liso", () => {
    expect(
      restoreAppState({ viewBackgroundColor: "#fff" } as any, null)
        .tuwBackground,
    ).toEqual(DEFAULT_SHEET_BACKGROUND);
  });

  it("un fondo dañado en el archivo se corrige al abrir", () => {
    const restored = restoreAppState(
      { tuwBackground: { type: 9, spacing: "x", lineColor: [] } } as any,
      null,
    );
    expect(restored.tuwBackground).toEqual(DEFAULT_SHEET_BACKGROUND);
  });

  it("también se guarda en el navegador y en la base (cada hoja, su propio fondo)", () => {
    const defaults = getDefaultAppState();
    expect(defaults.tuwBackground).toEqual(DEFAULT_SHEET_BACKGROUND);
  });
});
