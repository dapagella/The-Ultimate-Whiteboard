import { describe, expect, it } from "vitest";

import {
  DEFAULT_PEN_SETTINGS,
  PALM_SIZE,
  PEN_GRACE_MS,
  describePointer,
  isBarrelPressed,
  isEraserTip,
  isPalmLike,
  normalizePenSettings,
  retargetFor,
  shouldRejectTouch,
} from "../penInput";

const pen = (button: number, buttons: number) => ({
  pointerType: "pen",
  button,
  buttons,
});

describe("clasificación de eventos del lápiz", () => {
  it("el botón del costado llega como buttons&2 o button 2, solo para lápiz", () => {
    expect(isBarrelPressed(pen(0, 3))).toBe(true);
    expect(isBarrelPressed(pen(2, 2))).toBe(true);
    expect(isBarrelPressed(pen(0, 1))).toBe(false);
    expect(
      isBarrelPressed({ pointerType: "mouse", button: 2, buttons: 2 }),
    ).toBe(false);
  });

  it("la goma de la punta trasera llega como button 5 o buttons&32", () => {
    expect(isEraserTip(pen(5, 32))).toBe(true);
    expect(isEraserTip(pen(0, 32))).toBe(true);
    expect(isEraserTip(pen(0, 1))).toBe(false);
    expect(isEraserTip({ pointerType: "touch", button: 5, buttons: 32 })).toBe(
      false,
    );
  });

  it("una zona de contacto grande es una palma", () => {
    expect(
      isPalmLike({
        pointerType: "touch",
        button: 0,
        buttons: 1,
        width: PALM_SIZE,
      }),
    ).toBe(true);
    expect(
      isPalmLike({
        pointerType: "touch",
        button: 0,
        buttons: 1,
        width: 12,
        height: 14,
      }),
    ).toBe(false);
    expect(
      isPalmLike({ pointerType: "pen", button: 0, buttons: 1, width: 100 }),
    ).toBe(false);
  });
});

describe("rechazo de palma", () => {
  const touch = {
    pointerType: "touch",
    button: 0,
    buttons: 1,
    width: 10,
    height: 10,
  };
  const on = DEFAULT_PEN_SETTINGS;

  it("ignora el dedo mientras el lápiz está cerca y deja de ignorarlo después", () => {
    expect(shouldRejectTouch(touch, on, 1000, 1000 - 100)).toBe(true);
    expect(shouldRejectTouch(touch, on, 1000, 1000 - PEN_GRACE_MS - 1)).toBe(
      false,
    );
  });

  it("sin lápiz cerca el dedo funciona (mover y zoom)", () => {
    expect(shouldRejectTouch(touch, on, 5000, 0)).toBe(false);
  });

  it("una palma grande se ignora aunque no haya lápiz", () => {
    expect(shouldRejectTouch({ ...touch, width: 80 }, on, 5000, 0)).toBe(true);
  });

  it("apagado no ignora nada; el lápiz y el mouse nunca se ignoran", () => {
    const off = { ...on, rejectPalm: false };
    expect(shouldRejectTouch({ ...touch, width: 80 }, off, 1000, 1000)).toBe(
      false,
    );
    expect(shouldRejectTouch(pen(0, 1), on, 1000, 1000)).toBe(false);
    expect(
      shouldRejectTouch(
        { pointerType: "mouse", button: 0, buttons: 1 },
        on,
        1000,
        1000,
      ),
    ).toBe(false);
  });
});

describe("acción del botón del costado", () => {
  it("por defecto es borrar (Q20)", () => {
    expect(DEFAULT_PEN_SETTINGS.barrel).toBe("eraser");
  });

  it("borrar se disfraza de goma (button 5 / buttons 32) y al soltar libera", () => {
    expect(retargetFor("eraser", "down")).toEqual({ button: 5, buttons: 32 });
    expect(retargetFor("eraser", "move")).toEqual({ button: -1, buttons: 32 });
    expect(retargetFor("eraser", "up")).toEqual({ button: 5, buttons: 0 });
  });

  it("mover la hoja se disfraza de botón del medio", () => {
    expect(retargetFor("pan", "down")).toEqual({ button: 1, buttons: 4 });
    expect(retargetFor("pan", "up")).toEqual({ button: 1, buttons: 0 });
  });

  it("'nada' deja la punta dibujando normal; 'menú' no se toca", () => {
    expect(retargetFor("none", "down")).toEqual({ button: 0, buttons: 1 });
    expect(retargetFor("contextMenu", "down")).toBeNull();
  });
});

describe("normalizePenSettings", () => {
  it("rellena lo que falta y descarta valores raros", () => {
    expect(normalizePenSettings(undefined)).toEqual(DEFAULT_PEN_SETTINGS);
    expect(
      normalizePenSettings({ barrel: "hackear", rejectPalm: "si" }),
    ).toEqual(DEFAULT_PEN_SETTINGS);
    expect(normalizePenSettings({ barrel: "pan", rejectPalm: false })).toEqual({
      barrel: "pan",
      rejectPalm: false,
    });
  });
});

describe("describePointer (modo detectar botón)", () => {
  it("nombra lo que llegó", () => {
    expect(
      describePointer({ ...pen(0, 3), type: "pointerdown", pressure: 0.5 }),
    ).toBe(
      "pointerdown tipo=pen button=0 buttons=3 presión=0.50 → botón del costado",
    );
    expect(describePointer({ ...pen(5, 32), type: "pointerdown" })).toContain(
      "goma",
    );
  });
});
