import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WorkspaceError } from "../src/workspace/paths";
import {
  TRASH_RETENTION_MS,
  WorkspaceStore,
  defaultSheetContent,
} from "../src/workspace/store";

let dir: string;
let clock: number;
let store: WorkspaceStore;

const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "tuw-store-"));
  clock = Date.UTC(2026, 10, 25);
  store = new WorkspaceStore(path.join(dir, "ws"), { now: () => clock });
  await store.init();
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e: any) {
    return e instanceof WorkspaceError ? e.code : `OTHER:${e?.message}`;
  }
  return "NO_ERROR";
};

const names = (nodes: { name: string }[]) => nodes.map((n) => n.name);

describe("init y árbol", () => {
  it("crea la estructura interna y workspace.json", async () => {
    const meta = JSON.parse(
      await fs.readFile(
        path.join(store.root, ".tuw", "workspace.json"),
        "utf8",
      ),
    );
    expect(meta.formatVersion).toBe(1);
    expect(
      (await fs.stat(path.join(store.root, ".tuw", "trash"))).isDirectory(),
    ).toBe(true);
  });

  it("init es idempotente", async () => {
    await store.createFolder("", "A");
    await store.init();
    expect(names(await store.list())).toEqual(["A"]);
  });

  it("lista carpetas primero, luego hojas, en orden natural; oculta .tuw, ocultos y otros archivos", async () => {
    await store.createFolder("", "Parcial 10");
    await store.createFolder("", "Parcial 2");
    await store.createSheet("", "b");
    await store.createSheet("", "A");
    await fs.writeFile(path.join(store.root, "notas.txt"), "x");
    await fs.writeFile(path.join(store.root, ".oculto.excalidraw"), "{}");
    await fs.writeFile(path.join(store.root, "Hoja.excalidraw.1234.tmp"), "x");
    const tree = await store.list();
    expect(names(tree)).toEqual(["Parcial 2", "Parcial 10", "A", "b"]);
    expect(tree.map((n) => n.type)).toEqual([
      "folder",
      "folder",
      "sheet",
      "sheet",
    ]);
  });

  it("devuelve el árbol anidado con rutas relativas", async () => {
    await store.createFolder("", "Mate");
    await store.createFolder("Mate", "Álgebra");
    await store.createSheet("Mate/Álgebra", "Ecuaciones");
    const [mate] = await store.list();
    expect(mate.type === "folder" && mate.children[0]).toMatchObject({
      name: "Álgebra",
      path: "Mate/Álgebra",
    });
    const alg: any = (mate as any).children[0];
    expect(alg.children[0]).toMatchObject({
      type: "sheet",
      name: "Ecuaciones",
      path: "Mate/Álgebra/Ecuaciones.excalidraw",
    });
  });
});

describe("carpetas y hojas", () => {
  it("createFolder valida nombre, padre y duplicados (sin distinguir mayúsculas)", async () => {
    expect(await code(store.createFolder("", "a/b"))).toBe("INVALID_NAME");
    expect(await code(store.createFolder("noexiste", "X"))).toBe("NOT_FOUND");
    await store.createFolder("", "Mate");
    expect(await code(store.createFolder("", "mate"))).toBe("EXISTS");
  });

  it("createSheet numera los nombres repetidos", async () => {
    const a = await store.createSheet("", "Hoja");
    const b = await store.createSheet("", "Hoja");
    expect(a.path).toBe("Hoja.excalidraw");
    expect(b.path).toBe("Hoja (2).excalidraw");
  });

  it("createSheet crea un archivo Excalidraw válido", async () => {
    const { path: p } = await store.createSheet("", "Nueva");
    const { content } = await store.readSheet(p);
    expect(content).toBe(defaultSheetContent());
    expect(JSON.parse(content).type).toBe("excalidraw");
  });

  it("rename de hoja conserva la extensión; de carpeta mueve todo su contenido", async () => {
    await store.createFolder("", "Mate");
    await store.createSheet("Mate", "Uno");
    expect(await store.rename("Mate/Uno.excalidraw", "Dos")).toBe(
      "Mate/Dos.excalidraw",
    );
    expect(await store.rename("Mate", "Matemática")).toBe("Matemática");
    const tree = await store.list();
    expect((tree[0] as any).children[0].path).toBe("Matemática/Dos.excalidraw");
  });

  it("rename rechaza nombres ocupados o inválidos, pero permite cambiar solo mayúsculas", async () => {
    await store.createFolder("", "A");
    await store.createFolder("", "B");
    expect(await code(store.rename("A", "b"))).toBe("EXISTS");
    expect(await code(store.rename("A", "CON"))).toBe("INVALID_NAME");
    expect(await store.rename("A", "a")).toBe("a");
    expect(await code(store.rename("", "x"))).toBe("INVALID_OPERATION");
    expect(await code(store.rename("Z", "x"))).toBe("NOT_FOUND");
  });

  it("move mueve a otra carpeta o a la raíz", async () => {
    await store.createFolder("", "Mate");
    await store.createFolder("", "Fis");
    await store.createSheet("Mate", "H");
    expect(await store.move("Mate/H.excalidraw", "Fis")).toBe(
      "Fis/H.excalidraw",
    );
    expect(await store.move("Fis/H.excalidraw", "")).toBe("H.excalidraw");
    expect(await store.move("H.excalidraw", "")).toBe("H.excalidraw"); // mismo lugar
  });

  it("move numera si el destino ya tiene ese nombre", async () => {
    await store.createFolder("", "D");
    await store.createSheet("D", "H");
    await store.createSheet("", "H");
    expect(await store.move("H.excalidraw", "D")).toBe("D/H (2).excalidraw");
  });

  it("move no permite una carpeta dentro de sí misma ni de sus descendientes", async () => {
    await store.createFolder("", "A");
    await store.createFolder("A", "B");
    expect(await code(store.move("A", "A"))).toBe("INVALID_OPERATION");
    expect(await code(store.move("A", "A/B"))).toBe("INVALID_OPERATION");
    expect(await code(store.move("A", "noexiste"))).toBe("NOT_FOUND");
    expect(await code(store.move("", "A"))).toBe("INVALID_OPERATION");
    // "AB" no es descendiente de "A": prefijo textual, no de ruta
    await store.createFolder("", "AB");
    expect(await store.move("A", "AB")).toBe("AB/A");
  });

  it("duplicateSheet copia el contenido con nombre '(copia)'", async () => {
    const { path: p, version } = await store.createSheet("", "Orig");
    await store.writeSheet(p, '{"type":"excalidraw","elements":[1]}', version);
    const dup = await store.duplicateSheet(p);
    expect(dup.path).toBe("Orig (copia).excalidraw");
    expect((await store.readSheet(dup.path)).content).toContain(
      '"elements":[1]',
    );
    expect((await store.duplicateSheet(p)).path).toBe(
      "Orig (copia) (2).excalidraw",
    );
  });
});

describe("lectura y escritura de hojas", () => {
  it("guarda y lee con unicode intacto, sin dejar archivos temporales", async () => {
    const { path: p, version } = await store.createSheet("", "U");
    const content = JSON.stringify({ t: "∫₀¹ x² dx — ñandú 🎨" });
    const res = await store.writeSheet(p, content, version);
    expect(res.ok).toBe(true);
    expect((await store.readSheet(p)).content).toBe(content);
    const files = await fs.readdir(store.root);
    expect(files.filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("la versión devuelta permite guardar otra vez sin conflicto", async () => {
    const { path: p, version } = await store.createSheet("", "V");
    const r1 = await store.writeSheet(p, "uno", version);
    expect(r1.ok).toBe(true);
    const r2 = await store.writeSheet(p, "dos", (r1 as any).version);
    expect(r2.ok).toBe(true);
    expect((await store.readSheet(p)).content).toBe("dos");
  });

  it("solo opera sobre archivos .excalidraw", async () => {
    expect(await code(store.readSheet("notas.txt"))).toBe("INVALID_PATH");
    expect(await code(store.writeSheet("notas.txt", "x", null))).toBe(
      "INVALID_PATH",
    );
    expect(await code(store.readSheet("No.excalidraw"))).toBe("NOT_FOUND");
  });

  it("hace una copia de seguridad de la versión anterior (como máximo cada 5 minutos)", async () => {
    const { path: p, version } = await store.createSheet("", "B");
    const r1 = (await store.writeSheet(p, "v1", version)) as any;
    const bak = path.join(store.root, ".tuw", "bak", "B.excalidraw.bak");
    expect(await fs.readFile(bak, "utf8")).toBe(defaultSheetContent());
    clock += 60 * 1000;
    const r2 = (await store.writeSheet(p, "v2", r1.version)) as any;
    expect(await fs.readFile(bak, "utf8")).toBe(defaultSheetContent()); // aún no pasaron 5 min
    clock += 6 * 60 * 1000;
    await store.writeSheet(p, "v3", r2.version);
    expect(await fs.readFile(bak, "utf8")).toBe("v2");
  });
});

describe("cambios externos (conflictos)", () => {
  it("detecta que el archivo cambió en disco y NO lo pisa", async () => {
    const { path: p, version } = await store.createSheet("", "C");
    const abs = path.join(store.root, p);
    await fs.writeFile(abs, "editado afuera");
    const res = await store.writeSheet(p, "mi versión", version);
    expect(res.ok).toBe(false);
    expect((res as any).conflict).toBe(true);
    expect(await fs.readFile(abs, "utf8")).toBe("editado afuera");
  });

  it("no es conflicto si el archivo se tocó pero el contenido es el mismo", async () => {
    const { path: p, version } = await store.createSheet("", "T");
    const abs = path.join(store.root, p);
    await fs.writeFile(abs, defaultSheetContent()); // mismo contenido, mtime nuevo
    await fs.utimes(abs, new Date(), new Date(Date.now() + 5000));
    const res = await store.writeSheet(p, "nuevo", version);
    expect(res.ok).toBe(true);
  });

  it("con `force` guarda igual (para 'guardar mi versión')", async () => {
    const { path: p, version } = await store.createSheet("", "F");
    await fs.writeFile(path.join(store.root, p), "externo");
    const res = await store.writeSheet(p, "mía", version, { force: true });
    expect(res.ok).toBe(true);
    expect((await store.readSheet(p)).content).toBe("mía");
  });

  it("hoja nueva (expected=null) sobre un archivo existente es conflicto", async () => {
    const { path: p } = await store.createSheet("", "N");
    const res = await store.writeSheet(p, "x", null);
    expect(res.ok).toBe(false);
  });

  it("si la hoja fue borrada afuera, se vuelve a crear (no se pierde el trabajo)", async () => {
    const { path: p, version } = await store.createSheet("", "D");
    await fs.rm(path.join(store.root, p));
    const res = await store.writeSheet(p, "sigo acá", version);
    expect(res.ok).toBe(true);
    expect((await store.readSheet(p)).content).toBe("sigo acá");
  });
});

describe("papelera de 15 días", () => {
  it("trash saca la hoja del árbol y la lista en la papelera", async () => {
    await store.createFolder("", "Mate");
    await store.createSheet("Mate", "Uno");
    const entry = await store.trash("Mate/Uno.excalidraw");
    expect(entry).toMatchObject({
      type: "sheet",
      name: "Uno",
      originalPath: "Mate/Uno.excalidraw",
    });
    expect(((await store.list())[0] as any).children).toEqual([]);
    expect((await store.listTrash()).map((e) => e.id)).toEqual([entry.id]);
  });

  it("trash de una carpeta se lleva todo su contenido y restore lo devuelve completo", async () => {
    await store.createFolder("", "Mate");
    await store.createFolder("Mate", "Sub");
    await store.createSheet("Mate/Sub", "Deep");
    const entry = await store.trash("Mate");
    expect(await store.list()).toEqual([]);
    expect(await store.restoreTrash(entry.id)).toBe("Mate");
    const [mate] = (await store.list()) as any[];
    expect(mate.children[0].children[0].path).toBe("Mate/Sub/Deep.excalidraw");
    expect(await store.listTrash()).toEqual([]);
  });

  it("restore va a la raíz si la carpeta original ya no existe", async () => {
    await store.createFolder("", "Mate");
    await store.createSheet("Mate", "Uno");
    const sheet = await store.trash("Mate/Uno.excalidraw");
    await store.trash("Mate");
    expect(await store.restoreTrash(sheet.id)).toBe("Uno.excalidraw");
  });

  it("restore numera si el nombre original fue ocupado mientras tanto", async () => {
    await store.createSheet("", "Hoja");
    const entry = await store.trash("Hoja.excalidraw");
    await store.createSheet("", "Hoja");
    expect(await store.restoreTrash(entry.id)).toBe("Hoja (2).excalidraw");
  });

  it("purgeTrash borra solo lo que supera 15 días", async () => {
    await store.createSheet("", "Vieja");
    await store.createSheet("", "Reciente");
    const old = await store.trash("Vieja.excalidraw");
    clock += 14 * DAY;
    const recent = await store.trash("Reciente.excalidraw");
    clock += 2 * DAY; // Vieja: 16 días; Reciente: 2 días
    expect(await store.purgeTrash()).toBe(1);
    expect((await store.listTrash()).map((e) => e.id)).toEqual([recent.id]);
    expect(await code(store.restoreTrash(old.id))).toBe("NOT_FOUND");
  });

  it("la retención es de exactamente 15 días", () => {
    expect(TRASH_RETENTION_MS).toBe(15 * DAY);
  });

  it("deleteTrashForever elimina la entrada", async () => {
    await store.createSheet("", "X");
    const e = await store.trash("X.excalidraw");
    await store.deleteTrashForever(e.id);
    expect(await store.listTrash()).toEqual([]);
  });

  it("rechaza ids de papelera manipulados", async () => {
    for (const bad of [
      "../x",
      "..",
      "1-zzzzzzzz",
      "",
      "123-abcdef12/../..",
      5 as any,
    ]) {
      expect(await code(store.restoreTrash(bad))).toBe("INVALID_PATH");
      expect(await code(store.deleteTrashForever(bad))).toBe("INVALID_PATH");
    }
  });

  it("no se puede borrar la raíz ni lo que no existe", async () => {
    expect(await code(store.trash(""))).toBe("INVALID_OPERATION");
    expect(await code(store.trash("no.excalidraw"))).toBe("NOT_FOUND");
  });
});

describe("seguridad de rutas", () => {
  it("todas las operaciones rechazan traversal y rutas absolutas", async () => {
    const bad = [
      "../fuera",
      "a/../../fuera",
      "/etc",
      "C:/Windows",
      ".tuw/trash",
    ];
    for (const b of bad) {
      expect(
        await code(store.createFolder(b, "x")),
        `createFolder ${b}`,
      ).toMatch(/INVALID_PATH|OUTSIDE_WORKSPACE/);
      expect(await code(store.readSheet(`${b}/x.excalidraw`))).toMatch(
        /INVALID_PATH|OUTSIDE_WORKSPACE/,
      );
      expect(await code(store.rename(b, "x"))).toMatch(
        /INVALID_PATH|OUTSIDE_WORKSPACE/,
      );
      expect(await code(store.move(b, ""))).toMatch(
        /INVALID_PATH|OUTSIDE_WORKSPACE/,
      );
      expect(await code(store.trash(b))).toMatch(
        /INVALID_PATH|OUTSIDE_WORKSPACE/,
      );
    }
  });

  it("no sigue enlaces simbólicos que apunten fuera del espacio de trabajo", async () => {
    const outside = path.join(dir, "fuera");
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "secreto.excalidraw"), "{}");
    try {
      await fs.symlink(outside, path.join(store.root, "enlace"), "junction");
    } catch {
      return; // sin permisos para crear enlaces: se omite
    }
    expect(await code(store.readSheet("enlace/secreto.excalidraw"))).toBe(
      "OUTSIDE_WORKSPACE",
    );
    expect(await code(store.createSheet("enlace", "x"))).toBe(
      "OUTSIDE_WORKSPACE",
    );
    expect(names(await store.list())).not.toContain("enlace"); // ni se lista
  });
});
