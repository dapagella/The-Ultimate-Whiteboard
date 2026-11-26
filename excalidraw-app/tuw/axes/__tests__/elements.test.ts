import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { newElementWith } from "@excalidraw/element";
import { describe, expect, it } from "vitest";

import type {
  ExcalidrawArrowElement,
  ExcalidrawElement,
  ExcalidrawTextElement,
} from "@excalidraw/element/types";

import {
  axisIdFromSelection,
  axisIdOf,
  createAxisElements,
  isAxisElement,
  readAxis,
  regenerateAxis,
} from "../elements";
import { axisTips } from "../geometry";

const roleOf = (el: ExcalidrawElement) =>
  (el.customData as any).tuw.role as string;
const arrows = (els: ExcalidrawElement[]) =>
  els.filter((e) => e.type === "arrow") as ExcalidrawArrowElement[];
const texts = (els: ExcalidrawElement[]) =>
  els.filter((e) => e.type === "text") as ExcalidrawTextElement[];
const byRole = (els: ExcalidrawElement[], role: string) =>
  els.find((e) => roleOf(e) === role)!;

describe("createAxisElements", () => {
  it("2D: dos flechas y dos etiquetas, todas del mismo grupo y del mismo eje", () => {
    const { elements, groupId, axisId } = createAxisElements(
      2,
      { x: 100, y: 200 },
      { lengthX: 300, lengthY: 180 },
    );
    expect(arrows(elements)).toHaveLength(2);
    expect(
      texts(elements)
        .map((t) => t.text)
        .sort(),
    ).toEqual(["x", "y"]);
    expect(
      elements.every(
        (e) => e.groupIds.length === 1 && e.groupIds[0] === groupId,
      ),
    ).toBe(true);
    expect(
      elements.every((e) => axisIdOf(e) === axisId && isAxisElement(e)),
    ).toBe(true);
  });

  it("3D: tres flechas y tres etiquetas (x, y, z)", () => {
    const { elements } = createAxisElements(
      3,
      { x: 0, y: 0 },
      { lengthX: 300, lengthY: 300 },
    );
    expect(arrows(elements)).toHaveLength(3);
    expect(
      texts(elements)
        .map((t) => t.text)
        .sort(),
    ).toEqual(["x", "y", "z"]);
  });

  it("las flechas nacen en el origen y terminan donde dice la geometría, con punta", () => {
    const origin = { x: 100, y: 200 };
    const params = { lengthX: 300, lengthY: 180, lengthZ: 150, angleZDeg: 225 };
    const { elements } = createAxisElements(3, origin, params);
    const tips = axisTips(3, params);
    for (const role of ["x", "y", "z"] as const) {
      const a = byRole(elements, role) as ExcalidrawArrowElement;
      expect([a.x, a.y]).toEqual([origin.x, origin.y]);
      expect(a.points[0]).toEqual([0, 0]);
      expect(a.points[1][0]).toBeCloseTo(tips[role]!.x, 6);
      expect(a.points[1][1]).toBeCloseTo(tips[role]!.y, 6);
      expect(a.endArrowhead).toBe("arrow");
      expect(a.startBinding).toBeNull();
    }
  });

  it("el eje Z (3D) apunta hacia abajo y a la izquierda", () => {
    const { elements } = createAxisElements(
      3,
      { x: 0, y: 0 },
      { lengthX: 200, lengthY: 200 },
    );
    const z = byRole(elements, "z") as ExcalidrawArrowElement;
    expect(z.points[1][0]).toBeLessThan(0);
    expect(z.points[1][1]).toBeGreaterThan(0);
  });

  it("las etiquetas quedan más allá del extremo de su flecha", () => {
    const { elements } = createAxisElements(
      2,
      { x: 0, y: 0 },
      { lengthX: 300, lengthY: 200 },
    );
    const lx = byRole(elements, "label-x") as ExcalidrawTextElement;
    const ly = byRole(elements, "label-y") as ExcalidrawTextElement;
    expect(lx.x).toBeGreaterThan(300 - lx.width); // pasado (o sobre) el extremo en x
    expect(lx.x + lx.width / 2).toBeGreaterThan(300);
    expect(ly.y + ly.height / 2).toBeLessThan(-200);
  });

  it("aplica el estilo y acepta etiquetas propias", () => {
    const { elements } = createAxisElements(
      2,
      { x: 0, y: 0 },
      {},
      {
        strokeColor: "#e03131",
        strokeWidth: 3,
        opacity: 80,
        fontFamily: 5,
        fontSize: 24,
      },
      { x: "t", y: "v" },
    );
    expect(
      elements.every((e) => e.strokeColor === "#e03131" && e.opacity === 80),
    ).toBe(true);
    expect(
      texts(elements)
        .map((t) => t.text)
        .sort(),
    ).toEqual(["t", "v"]);
    expect((byRole(elements, "x") as ExcalidrawArrowElement).strokeWidth).toBe(
      3,
    );
  });

  it("dos ejes distintos no comparten ids ni grupo", () => {
    const a = createAxisElements(2, { x: 0, y: 0 }, {});
    const b = createAxisElements(2, { x: 0, y: 0 }, {});
    expect(a.axisId).not.toBe(b.axisId);
    expect(a.groupId).not.toBe(b.groupId);
    expect(new Set([...a.elements, ...b.elements].map((e) => e.id)).size).toBe(
      8,
    );
  });
});

describe("readAxis", () => {
  it("recupera dimensión, origen y tamaño", () => {
    const { elements, axisId } = createAxisElements(
      3,
      { x: 50, y: 60 },
      { lengthX: 300, lengthY: 200, lengthZ: 140, angleZDeg: 240 },
    );
    const info = readAxis(elements, axisId)!;
    expect(info.dim).toBe(3);
    expect(info.origin).toEqual({ x: 50, y: 60 });
    expect(info.params.lengthX).toBeCloseTo(300, 5);
    expect(info.params.lengthY).toBeCloseTo(200, 5);
    expect(info.params.lengthZ).toBeCloseTo(140, 5);
    expect(info.params.angleZDeg).toBeCloseTo(240, 4);
  });

  it("2D no tiene Z; un eje inexistente da null", () => {
    const { elements, axisId } = createAxisElements(2, { x: 0, y: 0 }, {});
    expect(readAxis(elements, axisId)!.dim).toBe(2);
    expect(readAxis(elements, "nada")).toBeNull();
  });

  it("ignora elementos borrados", () => {
    const { elements, axisId } = createAxisElements(2, { x: 0, y: 0 }, {});
    const broken = elements.map((e) =>
      roleOf(e) === "y" ? newElementWith(e, { isDeleted: true }) : e,
    );
    expect(readAxis(broken, axisId)).toBeNull();
  });
});

describe("regenerateAxis", () => {
  it("cambia el ángulo Z y el largo sin perder ids, grupo ni origen", () => {
    const { elements, axisId, groupId } = createAxisElements(
      3,
      { x: 10, y: 20 },
      { lengthX: 300, lengthY: 200 },
    );
    const before = new Map(elements.map((e) => [e.id, e]));
    const next = regenerateAxis(elements, axisId, {
      angleZDeg: 250,
      lengthZ: 100,
    });
    expect(next.map((e) => e.id)).toEqual(elements.map((e) => e.id));
    expect(next.every((e) => e.groupIds[0] === groupId)).toBe(true);
    const info = readAxis(next, axisId)!;
    expect(info.origin).toEqual({ x: 10, y: 20 });
    expect(info.params.angleZDeg).toBeCloseTo(250, 4);
    expect(info.params.lengthZ).toBeCloseTo(100, 5);
    expect(info.params.lengthX).toBeCloseTo(300, 5); // lo que no se cambió, igual
    // los elementos que cambiaron suben de versión (para que se guarden y redibujen)
    const z = byRole(next, "z");
    expect(z.version).toBeGreaterThan(before.get(z.id)!.version);
  });

  it("mueve la etiqueta con su flecha y CONSERVA el texto que el usuario escribió", () => {
    const { elements, axisId } = createAxisElements(
      2,
      { x: 0, y: 0 },
      { lengthX: 200, lengthY: 200 },
    );
    const edited = elements.map((e) =>
      roleOf(e) === "label-x"
        ? newElementWith(e as ExcalidrawTextElement, { text: "t (s)" })
        : e,
    );
    const next = regenerateAxis(edited, axisId, { lengthX: 500 });
    const label = byRole(next, "label-x") as ExcalidrawTextElement;
    expect(label.text).toBe("t (s)");
    expect(label.x + label.width / 2).toBeGreaterThan(500);
  });

  it("respeta el origen actual si el eje fue movido", () => {
    const { elements, axisId } = createAxisElements(2, { x: 0, y: 0 }, {});
    const moved = elements.map((e) =>
      newElementWith(e, { x: e.x + 400, y: e.y + 300 }),
    );
    const next = regenerateAxis(moved, axisId, { lengthX: 250 });
    expect(readAxis(next, axisId)!.origin).toEqual({ x: 400, y: 300 });
  });

  it("no toca elementos que no son del eje", () => {
    const { elements, axisId } = createAxisElements(2, { x: 0, y: 0 }, {});
    const other = createAxisElements(2, { x: 900, y: 900 }, {}).elements[0];
    const next = regenerateAxis([...elements, other], axisId, { lengthX: 300 });
    expect(next[next.length - 1]).toBe(other);
  });

  it("valores fuera de rango se corrigen; un eje inexistente no cambia nada", () => {
    const { elements, axisId } = createAxisElements(3, { x: 0, y: 0 }, {});
    expect(
      readAxis(regenerateAxis(elements, axisId, { angleZDeg: 10 }), axisId)!
        .params.angleZDeg,
    ).toBeCloseTo(180, 4);
    expect(regenerateAxis(elements, "nada", { lengthX: 999 })).toEqual(
      elements,
    );
  });
});

describe("selección y archivo", () => {
  it("axisIdFromSelection encuentra el eje de cualquier elemento seleccionado", () => {
    const { elements, axisId } = createAxisElements(2, { x: 0, y: 0 }, {});
    expect(axisIdFromSelection(elements, { [elements[3].id]: true })).toBe(
      axisId,
    );
    expect(axisIdFromSelection(elements, {})).toBeNull();
  });

  it("el eje se guarda en el archivo .excalidraw y vuelve igual (compatible con Excalidraw)", () => {
    const { elements, axisId } = createAxisElements(
      3,
      { x: 5, y: 6 },
      { lengthX: 260, lengthY: 180, angleZDeg: 230 },
    );
    const text = serializeAsJSON(elements, getDefaultAppState(), {}, "local");
    const back = restoreElements(
      JSON.parse(text).elements,
      null,
    ) as ExcalidrawElement[];
    const info = readAxis(back, axisId)!;
    expect(info.dim).toBe(3);
    expect(info.params.lengthX).toBeCloseTo(260, 4);
    expect(info.params.angleZDeg).toBeCloseTo(230, 3);
    expect(back.filter((e) => e.type === "arrow")).toHaveLength(3);
    expect(new Set(back.map((e) => e.groupIds[0])).size).toBe(1);
  });
});
