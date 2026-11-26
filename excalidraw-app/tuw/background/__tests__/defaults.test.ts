import { afterEach, describe, expect, it } from "vitest";

import {
  FACTORY_SHEET_STYLE,
  applyDefaultStyle,
  clearDefaultSheetStyle,
  getDefaultSheetStyle,
  isFactoryStyle,
  parseDefaultSheetStyle,
  saveDefaultSheetStyle,
} from "../defaults";

afterEach(() => {
  localStorage.clear();
});

const STYLE = {
  viewBackgroundColor: "#fff9db",
  tuwBackground: { type: "grid" as const, lineColor: "#336699", spacing: 32 },
};

describe("parseDefaultSheetStyle", () => {
  it("acepta un estilo válido", () => {
    expect(parseDefaultSheetStyle(STYLE)).toEqual(STYLE);
  });

  it("rechaza lo que no sirve y corrige el dibujo dañado", () => {
    for (const bad of [
      null,
      undefined,
      5,
      "x",
      {},
      { viewBackgroundColor: "rojo" },
      { viewBackgroundColor: 7 },
    ]) {
      expect(parseDefaultSheetStyle(bad)).toBeNull();
    }
    const fixed = parseDefaultSheetStyle({
      viewBackgroundColor: "#fff",
      tuwBackground: { type: "???", spacing: -9 },
    });
    expect(fixed!.tuwBackground.type).toBe("plain");
    expect(fixed!.tuwBackground.spacing).toBe(8);
  });
});

describe("guardar y leer", () => {
  it("sin nada guardado devuelve null", () => {
    expect(getDefaultSheetStyle()).toBeNull();
  });

  it("guarda y vuelve a leer el estilo", () => {
    expect(saveDefaultSheetStyle(STYLE)).toBe(true);
    expect(getDefaultSheetStyle()).toEqual(STYLE);
  });

  it("guardar el estilo de fábrica (liso y blanco) borra el predeterminado", () => {
    saveDefaultSheetStyle(STYLE);
    saveDefaultSheetStyle(FACTORY_SHEET_STYLE);
    expect(getDefaultSheetStyle()).toBeNull();
    expect(isFactoryStyle(FACTORY_SHEET_STYLE)).toBe(true);
    expect(isFactoryStyle(STYLE)).toBe(false);
  });

  it("clearDefaultSheetStyle lo borra", () => {
    saveDefaultSheetStyle(STYLE);
    clearDefaultSheetStyle();
    expect(getDefaultSheetStyle()).toBeNull();
  });

  it("un valor dañado en el almacenamiento se ignora", () => {
    localStorage.setItem("tuw-default-sheet-style", "{ roto");
    expect(getDefaultSheetStyle()).toBeNull();
  });
});

describe("applyDefaultStyle", () => {
  const scene = { elements: [], appState: { gridSize: 10 } as any, files: {} };

  it("pone el color y el dibujo de fondo en la hoja nueva, sin tocar lo demás", () => {
    const r = applyDefaultStyle(scene, STYLE);
    expect(r.appState).toMatchObject({
      gridSize: 10,
      viewBackgroundColor: "#fff9db",
      tuwBackground: STYLE.tuwBackground,
    });
    expect(r.elements).toBe(scene.elements);
  });

  it("sin estilo por defecto devuelve la misma escena", () => {
    expect(applyDefaultStyle(scene, null)).toBe(scene);
  });
});
