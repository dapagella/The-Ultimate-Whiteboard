import { describe, expect, it } from "vitest";

import {
  DEFAULT_AXIS_LENGTH,
  DEFAULT_Z_ANGLE,
  DEFAULT_Z_RATIO,
  MAX_AXIS_LENGTH,
  MIN_AXIS_LENGTH,
  axisTips,
  clampLength,
  clampZAngle,
  labelCenter,
  normalizeParams,
  paramsFromDrag,
  rolesOf,
  tipToPolar,
} from "../geometry";

const close = (a: number, b: number, digits = 6) =>
  expect(a).toBeCloseTo(b, digits);

describe("clamp", () => {
  it("el ángulo Z se limita a 180°–270° y NaN vuelve al valor por defecto", () => {
    expect(clampZAngle(100)).toBe(180);
    expect(clampZAngle(300)).toBe(270);
    expect(clampZAngle(200)).toBe(200);
    expect(clampZAngle(NaN)).toBe(DEFAULT_Z_ANGLE);
    expect(clampZAngle(Infinity)).toBe(DEFAULT_Z_ANGLE);
  });

  it("el largo se limita al rango permitido", () => {
    expect(clampLength(1)).toBe(MIN_AXIS_LENGTH);
    expect(clampLength(1e9)).toBe(MAX_AXIS_LENGTH);
    expect(clampLength(NaN)).toBe(DEFAULT_AXIS_LENGTH);
    expect(clampLength(300)).toBe(300);
  });
});

describe("normalizeParams", () => {
  it("2D no tiene Z", () => {
    expect(
      normalizeParams(2, {
        lengthX: 100,
        lengthY: 80,
        lengthZ: 50,
        angleZDeg: 200,
      }),
    ).toEqual({ lengthX: 100, lengthY: 80 });
  });

  it("3D completa Z (proporcional a X) y el ángulo por defecto", () => {
    const p = normalizeParams(3, { lengthX: 300, lengthY: 200 });
    expect(p.lengthZ).toBeCloseTo(300 * DEFAULT_Z_RATIO);
    expect(p.angleZDeg).toBe(DEFAULT_Z_ANGLE);
  });

  it("corrige valores fuera de rango", () => {
    const p = normalizeParams(3, {
      lengthX: -5,
      lengthY: 1e9,
      lengthZ: NaN,
      angleZDeg: 10,
    });
    expect(p).toMatchObject({
      lengthX: MIN_AXIS_LENGTH,
      lengthY: MAX_AXIS_LENGTH,
      angleZDeg: 180,
    });
    expect(Number.isFinite(p.lengthZ)).toBe(true);
  });
});

describe("axisTips (pantalla: y hacia abajo)", () => {
  it("2D: X a la derecha, Y hacia arriba", () => {
    const t = axisTips(2, { lengthX: 200, lengthY: 150 });
    expect(t.x).toEqual({ x: 200, y: 0 });
    expect(t.y).toEqual({ x: 0, y: -150 });
    expect(t.z).toBeUndefined();
  });

  it("3D a 225°: Z va hacia abajo y a la izquierda, en diagonal", () => {
    const t = axisTips(3, {
      lengthX: 200,
      lengthY: 200,
      lengthZ: 100,
      angleZDeg: 225,
    });
    close(t.z!.x, -70.710678);
    close(t.z!.y, 70.710678); // hacia abajo en pantalla
    expect(t.x).toEqual({ x: 200, y: 0 });
  });

  it("3D a 180° es horizontal a la izquierda; a 270°, vertical hacia abajo", () => {
    const left = axisTips(3, {
      lengthX: 100,
      lengthY: 100,
      lengthZ: 80,
      angleZDeg: 180,
    }).z!;
    close(left.x, -80);
    close(left.y, 0);
    const down = axisTips(3, {
      lengthX: 100,
      lengthY: 100,
      lengthZ: 80,
      angleZDeg: 270,
    }).z!;
    close(down.x, 0);
    close(down.y, 80);
  });

  it("el largo de Z es el pedido para cualquier ángulo", () => {
    for (const a of [180, 200, 225, 250, 270]) {
      const z = axisTips(3, {
        lengthX: 100,
        lengthY: 100,
        lengthZ: 123,
        angleZDeg: a,
      }).z!;
      close(Math.hypot(z.x, z.y), 123);
    }
  });

  it("un ángulo fuera de rango se corrige al límite", () => {
    const z = axisTips(3, {
      lengthX: 100,
      lengthY: 100,
      lengthZ: 50,
      angleZDeg: 90,
    }).z!;
    close(z.x, -50);
    close(z.y, 0);
  });

  it("rolesOf", () => {
    expect(rolesOf(2)).toEqual(["x", "y"]);
    expect(rolesOf(3)).toEqual(["x", "y", "z"]);
  });
});

describe("labelCenter / tipToPolar", () => {
  it("la etiqueta queda más allá del extremo, en la dirección de la flecha", () => {
    const c = labelCenter({ x: 100, y: 0 }, 16);
    expect(c).toEqual({ x: 116, y: 0 });
    const d = labelCenter({ x: 0, y: -50 }, 10);
    close(d.x, 0);
    close(d.y, -60);
    const diag = labelCenter({ x: -30, y: 40 }, 10);
    close(Math.hypot(diag.x - -30, diag.y - 40), 10);
  });

  it("un extremo en el origen no da NaN", () => {
    const c = labelCenter({ x: 0, y: 0 });
    expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true);
  });

  it("tipToPolar es la inversa de axisTips para Z", () => {
    for (const a of [180, 210, 225, 255, 270]) {
      const z = axisTips(3, {
        lengthX: 100,
        lengthY: 100,
        lengthZ: 90,
        angleZDeg: a,
      }).z!;
      const polar = tipToPolar(z);
      close(polar.angleDeg, a, 4);
      close(polar.length, 90, 4);
    }
  });
});

describe("paramsFromDrag", () => {
  it("un clic sin arrastre usa el tamaño por defecto", () => {
    expect(paramsFromDrag(2, 0, 0)).toEqual({
      lengthX: DEFAULT_AXIS_LENGTH,
      lengthY: DEFAULT_AXIS_LENGTH,
    });
    expect(paramsFromDrag(2, 5, 3)).toEqual({
      lengthX: DEFAULT_AXIS_LENGTH,
      lengthY: DEFAULT_AXIS_LENGTH,
    });
  });

  it("el arrastre define el ancho y el alto (en cualquier dirección)", () => {
    expect(paramsFromDrag(2, 300, -120)).toEqual({
      lengthX: 300,
      lengthY: 120,
    });
    expect(paramsFromDrag(2, -300, 120)).toEqual({
      lengthX: 300,
      lengthY: 120,
    });
  });

  it("si solo se arrastra en una dirección, la otra usa el valor por defecto", () => {
    expect(paramsFromDrag(2, 300, 2)).toEqual({
      lengthX: 300,
      lengthY: DEFAULT_AXIS_LENGTH,
    });
  });

  it("en 3D agrega Z y el ángulo", () => {
    const p = paramsFromDrag(3, 400, 300);
    expect(p.lengthZ).toBeCloseTo(400 * DEFAULT_Z_RATIO);
    expect(p.angleZDeg).toBe(DEFAULT_Z_ANGLE);
  });
});
