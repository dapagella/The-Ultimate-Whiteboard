import { describe, expect, it } from "vitest";

import {
  ancestorsOf,
  applyClick,
  buildIndex,
  collectFolders,
  countSheets,
  emptySelection,
  flatten,
  isSameOrInside,
  newItemParent,
  parentOf,
  pruneSelection,
  remapPath,
  topLevelOnly,
  trashDaysLeft,
  validDestinations,
  validateMove,
} from "../tree";

import type { TreeNode } from "../../../../desktop/src/api";

const sheet = (path: string): TreeNode => ({
  type: "sheet",
  name: path.split("/").pop()!.replace(".excalidraw", ""),
  path,
  mtimeMs: 0,
  size: 0,
});
const folder = (path: string, children: TreeNode[] = []): TreeNode => ({
  type: "folder",
  name: path.split("/").pop()!,
  path,
  children,
});

//  Mate/
//    Álgebra/
//      Ecuaciones.excalidraw
//    Parcial.excalidraw
//  Física/
//  Suelta.excalidraw
const TREE: TreeNode[] = [
  folder("Mate", [
    folder("Mate/Álgebra", [sheet("Mate/Álgebra/Ecuaciones.excalidraw")]),
    sheet("Mate/Parcial.excalidraw"),
  ]),
  folder("Física"),
  sheet("Suelta.excalidraw"),
];
const INDEX = buildIndex(TREE);
const paths = (rows: { node: TreeNode }[]) => rows.map((r) => r.node.path);

describe("rutas", () => {
  it("parentOf / ancestorsOf / isSameOrInside / remapPath", () => {
    expect(parentOf("a/b/c")).toBe("a/b");
    expect(parentOf("a")).toBe("");
    expect(ancestorsOf("a/b/c")).toEqual(["a", "a/b"]);
    expect(ancestorsOf("a")).toEqual([]);
    expect(isSameOrInside("a", "a/b")).toBe(true);
    expect(isSameOrInside("a", "ab")).toBe(false);
    expect(remapPath("Mate/Parcial.excalidraw", "Mate", "Estudio/Mate")).toBe(
      "Estudio/Mate/Parcial.excalidraw",
    );
    expect(remapPath("Mate", "Mate", "M")).toBe("M");
    expect(remapPath("Matemática/x", "Mate", "M")).toBe("Matemática/x");
  });
});

describe("árbol", () => {
  it("buildIndex, collectFolders y countSheets", () => {
    expect(INDEX.size).toBe(6);
    expect(collectFolders(TREE).map((f) => f.path)).toEqual([
      "Mate",
      "Mate/Álgebra",
      "Física",
    ]);
    expect(countSheets(TREE)).toBe(3);
  });

  it("flatten solo muestra lo desplegado", () => {
    expect(paths(flatten(TREE, new Set()))).toEqual([
      "Mate",
      "Física",
      "Suelta.excalidraw",
    ]);
    expect(paths(flatten(TREE, new Set(["Mate"])))).toEqual([
      "Mate",
      "Mate/Álgebra",
      "Mate/Parcial.excalidraw",
      "Física",
      "Suelta.excalidraw",
    ]);
  });

  it("flatten da la profundidad de cada fila", () => {
    const rows = flatten(TREE, new Set(["Mate", "Mate/Álgebra"]));
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 1, 0, 0]);
  });

  it("la búsqueda ignora mayúsculas y tildes, y muestra las carpetas contenedoras desplegadas", () => {
    expect(paths(flatten(TREE, new Set(), "ecuac"))).toEqual([
      "Mate",
      "Mate/Álgebra",
      "Mate/Álgebra/Ecuaciones.excalidraw",
    ]);
    expect(paths(flatten(TREE, new Set(), "algebra"))).toContain(
      "Mate/Álgebra",
    );
    expect(paths(flatten(TREE, new Set(), "FISICA"))).toEqual(["Física"]);
    expect(flatten(TREE, new Set(), "zzz")).toEqual([]);
  });

  it("con 300 hojas en 30 carpetas aplana en milisegundos", () => {
    const big: TreeNode[] = Array.from({ length: 30 }, (_, f) =>
      folder(
        `F${f}`,
        Array.from({ length: 10 }, (_, s) => sheet(`F${f}/H${s}.excalidraw`)),
      ),
    );
    const expanded = new Set(big.map((n) => n.path));
    const t0 = performance.now();
    const rows = flatten(big, expanded);
    const idx = buildIndex(big);
    flatten(big, expanded, "H5");
    expect(performance.now() - t0).toBeLessThan(100);
    expect(rows).toHaveLength(330);
    expect(idx.size).toBe(330);
  });
});

describe("selección múltiple", () => {
  const rows = flatten(TREE, new Set(["Mate", "Mate/Álgebra"]));
  // Mate, Mate/Álgebra, .../Ecuaciones, Mate/Parcial, Física, Suelta

  it("clic normal selecciona solo uno", () => {
    const s1 = applyClick(emptySelection, rows, "Física", {
      ctrl: false,
      shift: false,
    });
    expect([...s1.selected]).toEqual(["Física"]);
    const s2 = applyClick(s1, rows, "Suelta.excalidraw", {
      ctrl: false,
      shift: false,
    });
    expect([...s2.selected]).toEqual(["Suelta.excalidraw"]);
  });

  it("ctrl agrega y quita", () => {
    let s = applyClick(emptySelection, rows, "Mate", {
      ctrl: false,
      shift: false,
    });
    s = applyClick(s, rows, "Suelta.excalidraw", { ctrl: true, shift: false });
    expect([...s.selected].sort()).toEqual(["Mate", "Suelta.excalidraw"]);
    s = applyClick(s, rows, "Mate", { ctrl: true, shift: false });
    expect([...s.selected]).toEqual(["Suelta.excalidraw"]);
  });

  it("shift selecciona el rango visible entre el ancla y el clic (en ambos sentidos)", () => {
    let s = applyClick(emptySelection, rows, "Mate/Álgebra", {
      ctrl: false,
      shift: false,
    });
    s = applyClick(s, rows, "Física", { ctrl: false, shift: true });
    expect([...s.selected]).toEqual([
      "Mate/Álgebra",
      "Mate/Álgebra/Ecuaciones.excalidraw",
      "Mate/Parcial.excalidraw",
      "Física",
    ]);
    // el ancla se mantiene: shift hacia arriba reemplaza el rango
    s = applyClick(s, rows, "Mate", { ctrl: false, shift: true });
    expect([...s.selected]).toEqual(["Mate", "Mate/Álgebra"]);
  });

  it("ctrl+shift suma el rango a lo que ya estaba", () => {
    let s = applyClick(emptySelection, rows, "Suelta.excalidraw", {
      ctrl: false,
      shift: false,
    });
    s = applyClick(s, rows, "Mate", { ctrl: true, shift: false });
    s = applyClick(s, rows, "Mate/Parcial.excalidraw", {
      ctrl: true,
      shift: true,
    });
    expect([...s.selected].sort()).toEqual(
      [
        "Mate",
        "Mate/Álgebra",
        "Mate/Álgebra/Ecuaciones.excalidraw",
        "Mate/Parcial.excalidraw",
        "Suelta.excalidraw",
      ].sort(),
    );
  });

  it("shift sin ancla selecciona solo el clic", () => {
    const s = applyClick(emptySelection, rows, "Física", {
      ctrl: false,
      shift: true,
    });
    expect([...s.selected]).toEqual(["Física"]);
  });

  it("pruneSelection quita lo que ya no existe", () => {
    const s = { selected: new Set(["Mate", "Fantasma"]), anchor: "Fantasma" };
    const p = pruneSelection(s, INDEX);
    expect([...p.selected]).toEqual(["Mate"]);
    expect(p.anchor).toBeNull();
    expect(pruneSelection(p, INDEX)).toBe(p); // sin cambios → misma referencia
  });

  it("topLevelOnly descarta lo que está dentro de otro seleccionado", () => {
    expect(
      topLevelOnly([
        "Mate",
        "Mate/Parcial.excalidraw",
        "Suelta.excalidraw",
        "Mate",
      ]),
    ).toEqual(["Mate", "Suelta.excalidraw"]);
    expect(topLevelOnly(["Mate", "Matemática"])).toEqual([
      "Mate",
      "Matemática",
    ]);
  });
});

describe("validateMove", () => {
  it("permite mover hojas y carpetas a otra carpeta o a la raíz", () => {
    expect(validateMove(["Suelta.excalidraw"], "Física", INDEX)).toEqual({
      ok: true,
      movable: ["Suelta.excalidraw"],
    });
    expect(validateMove(["Mate/Parcial.excalidraw"], "", INDEX)).toEqual({
      ok: true,
      movable: ["Mate/Parcial.excalidraw"],
    });
    expect(validateMove(["Física"], "Mate", INDEX).ok).toBe(true);
  });

  it("no permite una carpeta dentro de sí misma ni de un descendiente", () => {
    expect(validateMove(["Mate"], "Mate", INDEX)).toMatchObject({ ok: false });
    expect(validateMove(["Mate"], "Mate/Álgebra", INDEX)).toMatchObject({
      ok: false,
    });
    // seleccionada junto a otras cosas: igual se rechaza todo
    expect(
      validateMove(["Suelta.excalidraw", "Mate"], "Mate/Álgebra", INDEX).ok,
    ).toBe(false);
  });

  it("rechaza destinos que no existen o son hojas", () => {
    expect(validateMove(["Física"], "Nada", INDEX).ok).toBe(false);
    expect(validateMove(["Física"], "Suelta.excalidraw", INDEX).ok).toBe(false);
  });

  it("ignora lo que ya está en el destino y avisa si no queda nada", () => {
    expect(
      validateMove(
        ["Mate/Parcial.excalidraw", "Suelta.excalidraw"],
        "Mate",
        INDEX,
      ),
    ).toEqual({
      ok: true,
      movable: ["Suelta.excalidraw"],
    });
    expect(validateMove(["Suelta.excalidraw"], "", INDEX)).toMatchObject({
      ok: false,
    });
  });

  it("mover una carpeta y su contenido a la vez cuenta solo la carpeta", () => {
    expect(
      validateMove(["Mate", "Mate/Parcial.excalidraw"], "Física", INDEX),
    ).toEqual({ ok: true, movable: ["Mate"] });
  });

  it("rechaza selecciones vacías o con rutas inexistentes", () => {
    expect(validateMove([], "Física", INDEX).ok).toBe(false);
    expect(validateMove(["Fantasma"], "Física", INDEX).ok).toBe(false);
  });

  it("validDestinations lista solo los destinos válidos, con la raíz primero", () => {
    expect(
      validDestinations(["Mate/Álgebra"], TREE, INDEX).map((d) => d.path),
    ).toEqual(["", "Física"]);
    expect(
      validDestinations(["Suelta.excalidraw"], TREE, INDEX).map((d) => d.path),
    ).toEqual(["Mate", "Mate/Álgebra", "Física"]);
  });
});

describe("newItemParent", () => {
  it("crea dentro de la carpeta elegida, junto a la hoja elegida, o en la raíz", () => {
    const sel = (...p: string[]) => ({
      selected: new Set(p),
      anchor: p[0] ?? null,
    });
    expect(newItemParent(sel("Mate"), INDEX)).toBe("Mate");
    expect(newItemParent(sel("Mate/Parcial.excalidraw"), INDEX)).toBe("Mate");
    expect(newItemParent(sel("Suelta.excalidraw"), INDEX)).toBe("");
    expect(newItemParent(sel("Mate", "Física"), INDEX)).toBe("");
    expect(newItemParent(emptySelection, INDEX)).toBe("");
  });
});

describe("papelera", () => {
  it("trashDaysLeft cuenta los días que faltan (máx. 15, mín. 0)", () => {
    const DAY = 24 * 60 * 60 * 1000;
    const e = {
      id: "1-aaaaaaaa",
      type: "sheet" as const,
      name: "x",
      originalPath: "x.excalidraw",
      deletedAt: 1_000_000_000_000,
    };
    expect(trashDaysLeft(e, e.deletedAt)).toBe(15);
    expect(trashDaysLeft(e, e.deletedAt + 10 * DAY)).toBe(5);
    expect(trashDaysLeft(e, e.deletedAt + 14.5 * DAY)).toBe(1);
    expect(trashDaysLeft(e, e.deletedAt + 20 * DAY)).toBe(0);
  });
});
