import { describe, expect, it } from "vitest";

import {
  DEFAULT_PINNED,
  assignmentKey,
  findAssignment,
  isAssignable,
  movePinned,
  normalizePinned,
  nudgePinned,
  pinItem,
  secondaryBits,
  unpinItem,
} from "../components/toolbarLayout";

const KNOWN = [...DEFAULT_PINNED, "rectangle", "image", "laser"];

describe("normalizePinned", () => {
  it("sin datos usa lo de fábrica", () => {
    expect(normalizePinned(null, KNOWN)).toEqual([...DEFAULT_PINNED]);
  });

  it("descarta repetidos y funciones desconocidas", () => {
    expect(normalizePinned(["hand", "hand", "nada", 5, "line"], KNOWN)).toEqual(
      ["hand", "line"],
    );
  });

  it("los ids de la app que no existen se ignoran", () => {
    expect(normalizePinned(null, ["hand", "line"])).toEqual(["hand", "line"]);
  });
});

describe("orden de la barra", () => {
  const list = ["a", "b", "c", "d"];

  it("movePinned manda un botón a la posición pedida", () => {
    expect(movePinned(list, "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(movePinned(list, "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(movePinned(list, "x", 1)).toEqual(list);
  });

  it("nudgePinned mueve un paso y no se sale de los bordes", () => {
    expect(nudgePinned(list, "b", -1)).toEqual(["b", "a", "c", "d"]);
    expect(nudgePinned(list, "b", 1)).toEqual(["a", "c", "b", "d"]);
    expect(nudgePinned(list, "a", -1)).toEqual(list);
    expect(nudgePinned(list, "d", 1)).toEqual(list);
  });

  it("fijar y quitar", () => {
    expect(pinItem(list, "e")).toEqual([...list, "e"]);
    expect(pinItem(list, "a")).toEqual(list);
    expect(unpinItem(list, "b")).toEqual(["a", "c", "d"]);
  });
});

describe("botones asignados", () => {
  it("secondaryBits lee el botón del costado, del medio y la goma", () => {
    expect(secondaryBits({ button: 0, buttons: 1 })).toEqual([]);
    expect(secondaryBits({ button: 0, buttons: 3 })).toEqual([2]);
    expect(secondaryBits({ button: 1, buttons: 4 })).toEqual([4]);
    expect(secondaryBits({ button: 5, buttons: 32 })).toEqual([32]);
    expect(secondaryBits({ button: 2, buttons: 0 })).toEqual([2]);
  });

  it("findAssignment distingue lápiz de mouse", () => {
    const a = { [assignmentKey("pen", 2)]: "hand" };
    expect(
      findAssignment(a, { pointerType: "pen", button: 0, buttons: 3 }),
    ).toEqual({ itemId: "hand", bit: 2 });
    expect(
      findAssignment(a, { pointerType: "mouse", button: 2, buttons: 2 }),
    ).toBeNull();
    expect(
      findAssignment(a, { pointerType: "pen", button: 0, buttons: 1 }),
    ).toBeNull();
  });

  it("el clic derecho del mouse no se puede asignar", () => {
    expect(isAssignable("mouse", 2)).toBe(false);
    expect(isAssignable("mouse", 4)).toBe(true);
    expect(isAssignable("pen", 2)).toBe(true);
  });
});
