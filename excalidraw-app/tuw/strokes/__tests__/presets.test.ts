import { afterEach, describe, expect, it } from "vitest";

import {
  BUILTIN_PRESETS,
  MAX_CUSTOM_PRESETS,
  addCustomPreset,
  allPresets,
  findPreset,
  loadCustomPresets,
  normalizePreset,
  parseCustomPresets,
  presetFromCurrent,
  presetToAppState,
  removeCustomPreset,
  saveCustomPresets,
} from "../presets";

afterEach(() => localStorage.clear());

const CURRENT = {
  color: "#e03131",
  opacity: 70,
  variability: "variable" as const,
  strokeWidth: 3,
  blendMode: "normal" as const,
};

describe("presets de fábrica", () => {
  it("son lápiz, lapicera, fibra y resaltador, con ids únicos", () => {
    expect(BUILTIN_PRESETS.map((p) => p.name)).toEqual([
      "Lápiz",
      "Lapicera",
      "Fibra",
      "Resaltador",
    ]);
    expect(new Set(BUILTIN_PRESETS.map((p) => p.id)).size).toBe(4);
  });

  it("el lápiz es variable y suave; la lapicera, constante y opaca", () => {
    const [pencil, pen] = BUILTIN_PRESETS;
    expect(pencil).toMatchObject({ variability: "variable", opacity: 85 });
    expect(pen).toMatchObject({ variability: "constant", opacity: 100 });
  });

  it("el grosor crece: lápiz < lapicera < fibra < resaltador", () => {
    const w = BUILTIN_PRESETS.map((p) => p.strokeWidth);
    expect([...w].sort((a, b) => a - b)).toEqual(w);
  });

  it("solo el resaltador usa multiply y es translúcido", () => {
    const hl = findPreset("highlighter", [])!;
    expect(hl).toMatchObject({ blendMode: "multiply", opacity: 40 });
    expect(
      BUILTIN_PRESETS.filter((p) => p.blendMode === "multiply"),
    ).toHaveLength(1);
  });
});

describe("presetToAppState", () => {
  it("fija color, opacidad, presión, grosor y modo de mezcla", () => {
    expect(presetToAppState(findPreset("highlighter", [])!)).toEqual({
      currentItemStrokeColor: "#ffd43b",
      currentItemOpacity: 40,
      currentItemStrokeVariability: "constant",
      tuwStroke: {
        preset: "highlighter",
        strokeWidth: 9,
        blendMode: "multiply",
      },
    });
  });
});

describe("presets propios", () => {
  it("se arman con lo activo y se validan", () => {
    const p = presetFromCurrent("  Mi rojo  ", CURRENT, "custom-1")!;
    expect(p).toMatchObject({
      id: "custom-1",
      name: "Mi rojo",
      builtin: false,
      color: "#e03131",
      opacity: 70,
      strokeWidth: 3,
    });
  });

  it("rechaza nombre vacío o color inválido", () => {
    expect(presetFromCurrent("   ", CURRENT)).toBeNull();
    expect(presetFromCurrent("x", { ...CURRENT, color: "rojo" })).toBeNull();
  });

  it("corrige valores fuera de rango", () => {
    const p = normalizePreset({
      id: "custom-a",
      name: "N".repeat(60),
      color: "#fff",
      strokeWidth: 999,
      opacity: 500,
      variability: "x",
      blendMode: "x",
    })!;
    expect(p.name).toHaveLength(24);
    expect(p.strokeWidth).toBe(30);
    expect(p.opacity).toBe(100);
    expect(p.variability).toBe("constant");
    expect(p.blendMode).toBe("normal");
  });

  it("no acepta ids que pisen los de fábrica ni datos basura", () => {
    for (const bad of [
      null,
      5,
      "x",
      {},
      { id: "pen", name: "x", color: "#fff", strokeWidth: 1, opacity: 1 },
    ]) {
      expect(normalizePreset(bad)).toBeNull();
    }
  });

  it("parseCustomPresets ignora lo inválido, los repetidos y limita la cantidad", () => {
    const ok = (i: number) => ({
      id: `custom-${i}`,
      name: `P${i}`,
      color: "#000000",
      strokeWidth: 1,
      opacity: 100,
    });
    const list = parseCustomPresets([
      ok(1),
      ok(1),
      { roto: true },
      ...Array.from({ length: 30 }, (_, i) => ok(i + 10)),
    ]);
    expect(list[0].id).toBe("custom-1");
    expect(new Set(list.map((p) => p.id)).size).toBe(list.length);
    expect(list.length).toBe(MAX_CUSTOM_PRESETS);
    expect(parseCustomPresets("no es lista")).toEqual([]);
  });

  it("addCustomPreset rechaza nombres repetidos (incluidos los de fábrica) y el tope", () => {
    const a = presetFromCurrent("Azul", CURRENT, "custom-a")!;
    const list = addCustomPreset([], a)!;
    expect(list).toHaveLength(1);
    expect(
      addCustomPreset(list, presetFromCurrent("azul", CURRENT, "custom-b")!),
    ).toBeNull();
    expect(
      addCustomPreset(list, presetFromCurrent("lápiz", CURRENT, "custom-c")!),
    ).toBeNull();
    const full = Array.from(
      { length: MAX_CUSTOM_PRESETS },
      (_, i) => presetFromCurrent(`P${i}`, CURRENT, `custom-${i}`)!,
    );
    expect(
      addCustomPreset(full, presetFromCurrent("Otro", CURRENT, "custom-z")!),
    ).toBeNull();
  });

  it("removeCustomPreset y allPresets/findPreset", () => {
    const a = presetFromCurrent("Azul", CURRENT, "custom-a")!;
    expect(allPresets([a])).toHaveLength(5);
    expect(findPreset("custom-a", [a])).toBe(a);
    expect(findPreset("nada", [a])).toBeUndefined();
    expect(removeCustomPreset([a], "custom-a")).toEqual([]);
  });

  it("se guardan y se leen del almacenamiento; lo dañado se ignora", () => {
    const a = presetFromCurrent("Azul", CURRENT, "custom-a")!;
    expect(saveCustomPresets([a])).toBe(true);
    expect(loadCustomPresets()).toEqual([a]);
    localStorage.setItem("tuw-custom-stroke-presets", "{ roto");
    expect(loadCustomPresets()).toEqual([]);
  });
});
