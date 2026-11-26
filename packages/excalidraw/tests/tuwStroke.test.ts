import {
  newElement,
  newFreeDrawElement,
  isMultiplyStroke,
} from "@excalidraw/element";
import { pointFrom } from "@excalidraw/math";
import { describe, expect, it } from "vitest";

import type { LocalPoint } from "@excalidraw/math";

import { getDefaultAppState } from "../appState";
import { restoreAppState } from "../data/restore";
import { exportScene } from "../scene/export";
import { DEFAULT_TUW_STROKE, normalizeTuwStroke } from "../scene/tuwStroke";

const stroke = (blendMode?: "multiply" | "normal") =>
  newFreeDrawElement({
    type: "freedraw",
    x: 10,
    y: 10,
    simulatePressure: false,
    strokeColor: "#ffd43b",
    opacity: 40,
    strokeWidth: 9,
    points: [
      pointFrom<LocalPoint>(0, 0),
      pointFrom<LocalPoint>(40, 5),
      pointFrom<LocalPoint>(80, 0),
    ],
    pressures: [0.5, 0.5, 0.5],
    customData: blendMode
      ? { tuw: { stroke: { preset: "highlighter", blendMode } } }
      : undefined,
  });

describe("isMultiplyStroke", () => {
  it("solo los trazos libres marcados como multiply", () => {
    expect(isMultiplyStroke(stroke("multiply"))).toBe(true);
    expect(isMultiplyStroke(stroke("normal"))).toBe(false);
    expect(isMultiplyStroke(stroke())).toBe(false);
    const rect = newElement({
      type: "rectangle",
      x: 0,
      y: 0,
      customData: { tuw: { stroke: { blendMode: "multiply" } } },
    });
    expect(isMultiplyStroke(rect)).toBe(false);
  });
});

describe("normalizeTuwStroke / estado", () => {
  it("corrige valores dañados", () => {
    expect(normalizeTuwStroke(null)).toEqual(DEFAULT_TUW_STROKE);
    expect(
      normalizeTuwStroke({ preset: 5, strokeWidth: "x", blendMode: "otro" }),
    ).toEqual(DEFAULT_TUW_STROKE);
    expect(
      normalizeTuwStroke({
        preset: "pen",
        strokeWidth: 999,
        blendMode: "multiply",
      }),
    ).toEqual({
      preset: "pen",
      strokeWidth: 30,
      blendMode: "multiply",
    });
  });

  it("el estado por defecto no tiene preset y restoreAppState lo normaliza", () => {
    expect(getDefaultAppState().tuwStroke).toEqual(DEFAULT_TUW_STROKE);
    expect(
      restoreAppState(
        {
          tuwStroke: {
            blendMode: "multiply",
            preset: "highlighter",
            strokeWidth: 9,
          },
        } as any,
        null,
      ).tuwStroke,
    ).toEqual({
      preset: "highlighter",
      strokeWidth: 9,
      blendMode: "multiply",
    });
    expect(restoreAppState({} as any, null).tuwStroke).toEqual(
      DEFAULT_TUW_STROKE,
    );
  });
});

describe("exportación SVG del resaltador", () => {
  const exportSvg = (elements: any[]) =>
    exportScene({
      type: "svg",
      data: {
        elements,
        appState: { viewBackgroundColor: "#ffffff" } as any,
        files: null,
      },
      config: { skipInliningFonts: true } as any,
    });

  it("el trazo multiply lleva mix-blend-mode: multiply", async () => {
    const svg = await exportSvg([stroke("multiply")]);
    const g = [...svg.querySelectorAll("g")].find((n) =>
      (n.getAttribute("style") ?? "").includes("mix-blend-mode"),
    );
    expect(g).toBeTruthy();
    expect(g!.getAttribute("style")).toContain("multiply");
  });

  it("un trazo normal NO lleva mezcla", async () => {
    const svg = await exportSvg([stroke(), stroke("normal")]);
    expect(svg.outerHTML).not.toContain("mix-blend-mode");
  });

  it("solo se mezcla el resaltador, no el resto de la escena", async () => {
    const svg = await exportSvg([stroke(), stroke("multiply")]);
    expect(svg.outerHTML.match(/mix-blend-mode/g)).toHaveLength(1);
  });
});

describe("customData de TUW en el archivo", () => {
  it("el modo de mezcla del trazo se conserva al guardar y volver a abrir", async () => {
    const { serializeAsJSON } = await import("../data/json");
    const { restoreElements } = await import("../data/restore");
    const text = serializeAsJSON(
      [stroke("multiply")],
      getDefaultAppState(),
      {},
      "local",
    );
    const back = restoreElements(JSON.parse(text).elements, null);
    expect(isMultiplyStroke(back[0])).toBe(true);
    expect((back[0] as any).customData.tuw.stroke.preset).toBe("highlighter");
  });
});
