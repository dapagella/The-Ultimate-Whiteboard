import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  WorkspaceError,
  baseName,
  isSameOrInside,
  joinRel,
  parentRel,
  resolveInWorkspace,
  sheetDisplayName,
  splitRelPath,
  uniqueName,
  validateName,
} from "../src/workspace/paths";

const ROOT = path.resolve("/tmp/tuw-ws");

describe("validateName", () => {
  it("acepta nombres normales (con tildes, espacios y números)", () => {
    for (const n of ["Álgebra", "Hoja 1", "Parcial 2 - Matemática", "a.b"]) {
      expect(validateName(n)).toEqual({ ok: true, name: n });
    }
  });

  it("recorta espacios en los extremos", () => {
    expect(validateName("  Hola  ")).toEqual({ ok: true, name: "Hola" });
  });

  it("rechaza vacío, solo espacios y demasiado largo", () => {
    expect(validateName("").ok).toBe(false);
    expect(validateName("   ").ok).toBe(false);
    expect(validateName("x".repeat(121)).ok).toBe(false);
    expect(validateName("x".repeat(120)).ok).toBe(true);
  });

  it("rechaza caracteres inválidos en Windows y de control", () => {
    for (const c of [
      "a/b",
      "a\\b",
      "a:b",
      "a*b",
      "a?b",
      'a"b',
      "a<b",
      "a>b",
      "a|b",
      "a\u0000b",
      "a\nb",
    ]) {
      expect(validateName(c).ok).toBe(false);
    }
  });

  it("rechaza nombres reservados de Windows, con o sin extensión", () => {
    for (const n of [
      "CON",
      "nul",
      "Aux",
      "COM1",
      "lpt9",
      "NUL.txt",
      "con.excalidraw",
    ]) {
      expect(validateName(n).ok).toBe(false);
    }
    expect(validateName("CONSOLA").ok).toBe(true);
    expect(validateName("COM10").ok).toBe(true);
  });

  it("rechaza puntos al inicio (incluye .tuw) y al final", () => {
    expect(validateName(".tuw").ok).toBe(false);
    expect(validateName(".oculto").ok).toBe(false);
    expect(validateName("nombre.").ok).toBe(false);
  });

  it("rechaza lo que no es string", () => {
    expect(validateName(undefined as any).ok).toBe(false);
    expect(validateName(42 as any).ok).toBe(false);
  });
});

describe("splitRelPath / resolveInWorkspace", () => {
  it('"" es la raíz', () => {
    expect(splitRelPath("")).toEqual([]);
    expect(resolveInWorkspace(ROOT, "")).toBe(ROOT);
  });

  it("resuelve rutas anidadas dentro de la raíz", () => {
    expect(resolveInWorkspace(ROOT, "Mate/Álgebra/Ec.excalidraw")).toBe(
      path.join(ROOT, "Mate", "Álgebra", "Ec.excalidraw"),
    );
  });

  it("rechaza traversal, absolutas, unidades, barras invertidas y segmentos vacíos", () => {
    for (const bad of [
      "..",
      "../x",
      "a/../../x",
      "a/./b",
      "/etc/passwd",
      "C:/Windows",
      "c:\\Windows",
      "a\\b",
      "a//b",
      "a/",
      "a\0b",
    ]) {
      expect(() => resolveInWorkspace(ROOT, bad), bad).toThrow(WorkspaceError);
    }
  });

  it("la carpeta interna .tuw no es accesible salvo que se permita", () => {
    expect(() => resolveInWorkspace(ROOT, ".tuw/trash")).toThrow(
      WorkspaceError,
    );
    expect(() => resolveInWorkspace(ROOT, "a/.TUW/x")).toThrow(WorkspaceError);
    expect(
      resolveInWorkspace(ROOT, ".tuw/trash", { allowInternal: true }),
    ).toBe(path.join(ROOT, ".tuw", "trash"));
  });

  it("rechaza lo que no es string", () => {
    expect(() => splitRelPath(null as any)).toThrow(WorkspaceError);
  });
});

describe("helpers de rutas", () => {
  it("joinRel / parentRel / baseName / isSameOrInside", () => {
    expect(joinRel("", "a", "", "b")).toBe("a/b");
    expect(parentRel("a/b/c")).toBe("a/b");
    expect(parentRel("a")).toBe("");
    expect(baseName("a/b/c.excalidraw")).toBe("c.excalidraw");
    expect(isSameOrInside("a", "a")).toBe(true);
    expect(isSameOrInside("a", "a/b")).toBe(true);
    expect(isSameOrInside("a", "ab")).toBe(false);
    expect(isSameOrInside("a/b", "a")).toBe(false);
  });

  it("sheetDisplayName quita la extensión", () => {
    expect(sheetDisplayName("Hoja 1.excalidraw")).toBe("Hoja 1");
    expect(sheetDisplayName("Hoja 1.EXCALIDRAW")).toBe("Hoja 1");
    expect(sheetDisplayName("otro.txt")).toBe("otro.txt");
  });
});

describe("uniqueName", () => {
  it("devuelve el nombre si está libre y numera si choca (sin distinguir mayúsculas)", () => {
    expect(uniqueName([], "Hoja", ".excalidraw")).toBe("Hoja.excalidraw");
    expect(uniqueName(["Hoja.excalidraw"], "Hoja", ".excalidraw")).toBe(
      "Hoja (2).excalidraw",
    );
    expect(
      uniqueName(
        ["HOJA.excalidraw", "Hoja (2).excalidraw"],
        "Hoja",
        ".excalidraw",
      ),
    ).toBe("Hoja (3).excalidraw");
    expect(uniqueName(["Mate"], "mate")).toBe("mate (2)");
  });
});
