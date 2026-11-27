import { describe, expect, it } from "vitest";

import {
  DEFAULT_PEN_SETTINGS,
  MIN_STRAIGHT_PX,
  PALM_SIZE,
  PEN_GRACE_MS,
  describePointer,
  isBarrelPressed,
  isEraserTip,
  isPalmLike,
  canStraighten,
  normalizePenSettings,
  retargetFor,
  shouldRejectTouch,
  isLineLike,
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
    expect(
      normalizePenSettings({
        barrel: "pan",
        rejectPalm: false,
        straightHold: false,
        tabletAsMouse: true,
      }),
    ).toEqual({
      barrel: "pan",
      rejectPalm: false,
      straightHold: false,
      tabletAsMouse: true,
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

describe("línea recta al mantener quieto", () => {
  it("viene activada por defecto", () => {
    expect(DEFAULT_PEN_SETTINGS.straightHold).toBe(true);
  });

  it("solo endereza trazos que ya recorrieron algo (no puntos)", () => {
    const o = { x: 0, y: 0 };
    expect(canStraighten(o, { x: 3, y: 4 })).toBe(false);
    expect(canStraighten(o, { x: MIN_STRAIGHT_PX, y: 0 })).toBe(true);
    expect(canStraighten(o, { x: 30, y: 40 })).toBe(true);
  });
});

describe("isLineLike (solo se endereza lo que ya parece una línea)", () => {
  const line = Array.from({ length: 40 }, (_, i) => ({
    x: i * 5,
    y: Math.sin(i) * 3, // tiembla un poco
  }));

  it("una línea con temblor sí", () => {
    expect(isLineLike(line)).toBe(true);
  });

  it("una letra o curva con pausa NO (escribir no se vuelve una recta)", () => {
    const circle = Array.from({ length: 40 }, (_, i) => ({
      x: 50 + Math.cos(i / 6) * 50,
      y: 50 + Math.sin(i / 6) * 50,
    }));
    expect(isLineLike(circle)).toBe(false);
    const hook = [
      ...line.slice(0, 20),
      ...Array.from({ length: 10 }, (_, i) => ({ x: 95, y: i * 8 })),
    ];
    expect(isLineLike(hook)).toBe(false);
  });

  it("demasiado corto o vacío no", () => {
    expect(isLineLike([])).toBe(false);
    expect(
      isLineLike([
        { x: 0, y: 0 },
        { x: 3, y: 0 },
      ]),
    ).toBe(false);
  });
});
