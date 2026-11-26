// Controlador del explorador contra el almacén REAL (disco) y la sesión real, sin Electron ni React.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toResult } from "../../../../desktop/src/workspace/result";
import { WorkspaceStore } from "../../../../desktop/src/workspace/store";
import { serializeScene } from "../../workspace/sceneFile";
import { SheetSession } from "../../workspace/sheetSession";
import {
  createFolder,
  createSheet,
  deleteFromTrash,
  duplicateSheet,
  moveItems,
  openSheet,
  renameItem,
  restoreFromTrash,
  trashItems,
} from "../controller";

import type { ExplorerDeps } from "../controller";

let dir: string;
let store: WorkspaceStore;
let session: SheetSession;
let deps: ExplorerDeps;
let replaceScene: ReturnType<typeof vi.fn>;

const ws = () => ({
  list: () => toResult(() => store.list()),
  createFolder: (p: string, n: string) =>
    toResult(() => store.createFolder(p, n)),
  createSheet: (p: string, n: string) =>
    toResult(() => store.createSheet(p, n)),
  rename: (p: string, n: string) => toResult(() => store.rename(p, n)),
  move: (p: string, d: string) => toResult(() => store.move(p, d)),
  duplicateSheet: (p: string) => toResult(() => store.duplicateSheet(p)),
  readSheet: (p: string) => toResult(() => store.readSheet(p)),
  trash: (p: string) => toResult(() => store.trash(p)),
  listTrash: () => toResult(() => store.listTrash()),
  restoreTrash: (id: string) => toResult(() => store.restoreTrash(id)),
  deleteTrashForever: async (id: string) =>
    toResult(async () => {
      await store.deleteTrashForever(id);
      return null;
    }),
});

const text = (n: number) =>
  serializeScene(
    Array.from({ length: n }, (_, i) => ({
      id: `e${i}`,
      type: "rectangle",
      x: i,
      y: 0,
    })) as any,
    {},
    {},
  );

const exists = (rel: string) =>
  fs.access(path.join(store.root, rel)).then(
    () => true,
    () => false,
  );
const elementsOf = async (rel: string) =>
  JSON.parse(await fs.readFile(path.join(store.root, rel), "utf8")).elements
    .length;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "tuw-ctl-"));
  store = new WorkspaceStore(path.join(dir, "ws"));
  await store.init();
  replaceScene = vi.fn();
  session = new SheetSession(
    {
      readSheet: (p) => toResult(() => store.readSheet(p)),
      writeSheet: (p, c, e, f) =>
        toResult(() => store.writeSheet(p, c, e, { force: f })),
      createSheet: (p, n) => toResult(() => store.createSheet(p, n)),
      setLastSheet: async () => ({ ok: true, value: null }),
    },
    { onConflict: vi.fn(), onError: vi.fn() },
    { debounceMs: 20 },
  );
  deps = { ws: ws() as any, session, editor: { replaceScene } };
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const startWith = async (name = "A") => {
  const p = await createSheet(deps, "", name);
  replaceScene.mockClear();
  return p;
};

describe("abrir hojas", () => {
  it("guarda lo pendiente de la hoja actual antes de abrir otra y carga la nueva en el editor", async () => {
    const a = await startWith("A");
    await store.createSheet("", "B", text(2));
    session.notifyChange(() => text(4)); // cambios sin guardar en A
    await openSheet(deps, "B.excalidraw");
    expect(await elementsOf(a)).toBe(4);
    expect(session.currentPath).toBe("B.excalidraw");
    expect(replaceScene).toHaveBeenCalledOnce();
    expect(replaceScene.mock.calls[0][0].elements).toHaveLength(2);
  });

  it("abrir la hoja que ya está abierta no hace nada", async () => {
    const a = await startWith("A");
    await openSheet(deps, a);
    expect(replaceScene).not.toHaveBeenCalled();
  });

  it("si la hoja elegida está dañada, la actual queda abierta y se informa el error", async () => {
    const a = await startWith("A");
    await store.createSheet("", "Rota", "{ basura");
    await expect(openSheet(deps, "Rota.excalidraw")).rejects.toThrow();
    expect(session.currentPath).toBe(a);
    expect(replaceScene).not.toHaveBeenCalled();
  });

  it("al abrir una hoja sin cambios, el siguiente guardado idéntico no reescribe el archivo", async () => {
    await store.createSheet("", "B", text(2));
    await startWith("A");
    await openSheet(deps, "B.excalidraw");
    const scene = replaceScene.mock.calls[0][0];
    const before = (await fs.stat(path.join(store.root, "B.excalidraw")))
      .mtimeMs;
    session.notifyChange(() =>
      serializeScene(scene.elements, scene.appState, scene.files),
    );
    await session.flush();
    expect((await fs.stat(path.join(store.root, "B.excalidraw"))).mtimeMs).toBe(
      before,
    );
  });
});

describe("crear", () => {
  it("createSheet crea y abre la hoja nueva", async () => {
    await startWith("A");
    const p = await createSheet(deps, "", "Nueva");
    expect(p).toBe("Nueva.excalidraw");
    expect(session.currentPath).toBe(p);
    expect(replaceScene).toHaveBeenCalled();
  });

  it("createFolder crea y rechaza nombres inválidos con el código del error", async () => {
    expect(await createFolder(deps, "", "Mate")).toBe("Mate");
    await expect(createFolder(deps, "", "a/b")).rejects.toMatchObject({
      code: "INVALID_NAME",
    });
    await expect(createFolder(deps, "", "mate")).rejects.toMatchObject({
      code: "EXISTS",
    });
  });
});

describe("renombrar", () => {
  it("renombrar la hoja abierta: la sesión la sigue y no queda un archivo fantasma con el nombre viejo", async () => {
    const a = await startWith("Vieja");
    session.notifyChange(() => text(1));
    const nuevo = await renameItem(deps, a, "Nueva");
    expect(nuevo).toBe("Nueva.excalidraw");
    expect(session.currentPath).toBe("Nueva.excalidraw");
    session.notifyChange(() => text(3));
    await session.flush();
    expect(await elementsOf("Nueva.excalidraw")).toBe(3);
    expect(await exists("Vieja.excalidraw")).toBe(false);
  });

  it("renombrar la carpeta que contiene la hoja abierta", async () => {
    await createFolder(deps, "", "Mate");
    const a = await createSheet(deps, "Mate", "H");
    expect(a).toBe("Mate/H.excalidraw");
    await renameItem(deps, "Mate", "Matemática");
    expect(session.currentPath).toBe("Matemática/H.excalidraw");
    session.notifyChange(() => text(2));
    await session.flush();
    expect(await elementsOf("Matemática/H.excalidraw")).toBe(2);
    expect(await exists("Mate")).toBe(false);
  });

  it("propaga EXISTS si el nombre está ocupado y no cambia nada", async () => {
    const a = await startWith("A");
    await store.createSheet("", "B");
    await expect(renameItem(deps, a, "B")).rejects.toMatchObject({
      code: "EXISTS",
    });
    expect(session.currentPath).toBe(a);
  });
});

describe("mover", () => {
  it("mueve la hoja abierta a una carpeta y la sesión la sigue", async () => {
    const a = await startWith("A");
    await createFolder(deps, "", "Mate");
    const r = await moveItems(deps, [a], "Mate");
    expect(r.moved).toEqual([
      { from: "A.excalidraw", to: "Mate/A.excalidraw" },
    ]);
    expect(session.currentPath).toBe("Mate/A.excalidraw");
    session.notifyChange(() => text(2));
    await session.flush();
    expect(await elementsOf("Mate/A.excalidraw")).toBe(2);
    expect(await exists("A.excalidraw")).toBe(false);
  });

  it("no permite mover una carpeta dentro de sí misma ni de sus descendientes (y no toca el disco)", async () => {
    await createFolder(deps, "", "A");
    await createFolder(deps, "A", "B");
    await expect(moveItems(deps, ["A"], "A/B")).rejects.toMatchObject({
      code: "INVALID_OPERATION",
    });
    await expect(moveItems(deps, ["A"], "A")).rejects.toMatchObject({
      code: "INVALID_OPERATION",
    });
    expect(await exists("A/B")).toBe(true);
  });

  it("mueve varios elementos a la vez; con nombres repetidos numera", async () => {
    await createFolder(deps, "", "D");
    await store.createSheet("D", "H");
    await store.createSheet("", "H");
    await store.createSheet("", "X");
    const r = await moveItems(deps, ["H.excalidraw", "X.excalidraw"], "D");
    expect(r.moved.map((m) => m.to).sort()).toEqual([
      "D/H (2).excalidraw",
      "D/X.excalidraw",
    ]);
  });

  it("mover la carpeta que contiene la hoja abierta", async () => {
    await createFolder(deps, "", "Mate");
    await createFolder(deps, "", "Estudio");
    await createSheet(deps, "Mate", "H");
    await moveItems(deps, ["Mate"], "Estudio");
    expect(session.currentPath).toBe("Estudio/Mate/H.excalidraw");
  });

  it("un cambio del editor durante el movimiento se guarda en la ruta NUEVA, nunca en la vieja", async () => {
    const a = await startWith("A");
    await createFolder(deps, "", "Mate");
    const realMove = deps.ws.move;
    deps.ws = {
      ...deps.ws,
      move: async (p, d) => {
        session.notifyChange(() => text(7)); // el usuario dibuja justo ahora
        return realMove(p, d);
      },
    };
    await moveItems(deps, [a], "Mate");
    await session.flush();
    expect(await exists("A.excalidraw")).toBe(false);
    expect(await elementsOf("Mate/A.excalidraw")).toBe(7);
  });
});

describe("papelera", () => {
  it("borrar una hoja que no está abierta la manda a la papelera sin cambiar la abierta", async () => {
    const a = await startWith("A");
    await store.createSheet("", "B");
    const [e] = await trashItems(deps, ["B.excalidraw"]);
    expect(e.name).toBe("B");
    expect(session.currentPath).toBe(a);
    expect(replaceScene).not.toHaveBeenCalled();
    expect(await exists("B.excalidraw")).toBe(false);
  });

  it("borrar la hoja abierta guarda lo último, abre otra y NO la vuelve a escribir", async () => {
    await store.createSheet("", "Otra");
    const a = await startWith("A");
    session.notifyChange(() => text(5));
    await trashItems(deps, [a]);
    expect(session.currentPath).toBe("Otra.excalidraw");
    expect(await exists("A.excalidraw")).toBe(false); // no reapareció
    // lo último que se dibujó quedó en la papelera
    const entries = await store.listTrash();
    expect(entries).toHaveLength(1);
    const restored = await restoreFromTrash(deps, entries[0].id);
    expect(await elementsOf(restored)).toBe(5);
  });

  it("si era la única hoja, crea 'Hoja 1'", async () => {
    const a = await startWith("Unica");
    await trashItems(deps, [a]);
    expect(session.currentPath).toBe("Hoja 1.excalidraw");
  });

  it("borrar la carpeta que contiene la hoja abierta", async () => {
    await createFolder(deps, "", "Mate");
    await createSheet(deps, "Mate", "H");
    await store.createSheet("", "Afuera");
    await trashItems(deps, ["Mate"]);
    expect(session.currentPath).toBe("Afuera.excalidraw");
    expect(await exists("Mate")).toBe(false);
  });

  it("borrado múltiple: una carpeta y su contenido seleccionados juntos no dan error", async () => {
    await createFolder(deps, "", "Mate");
    await store.createSheet("Mate", "H");
    await store.createSheet("", "X");
    await startWith("Y");
    const entries = await trashItems(deps, [
      "Mate",
      "Mate/H.excalidraw",
      "X.excalidraw",
    ]);
    expect(entries.map((e) => e.name).sort()).toEqual(["Mate", "X"]);
  });

  it("restaurar devuelve la ruta; borrar definitivamente la elimina", async () => {
    await startWith("A");
    await store.createSheet("", "B");
    const [e] = await trashItems(deps, ["B.excalidraw"]);
    expect(await restoreFromTrash(deps, e.id)).toBe("B.excalidraw");
    const [e2] = await trashItems(deps, ["B.excalidraw"]);
    await deleteFromTrash(deps, e2.id);
    expect(await store.listTrash()).toEqual([]);
  });
});

describe("duplicar", () => {
  it("la copia incluye lo último dibujado aunque aún no se haya autoguardado", async () => {
    const a = await startWith("A");
    session.notifyChange(() => text(6));
    const copy = await duplicateSheet(deps, a);
    expect(copy).toBe("A (copia).excalidraw");
    expect(await elementsOf(copy)).toBe(6);
    expect(session.currentPath).toBe(a); // no cambia de hoja
  });
});

describe("estilo por defecto de las hojas nuevas (Q9)", () => {
  const STYLE = {
    viewBackgroundColor: "#fff9db",
    tuwBackground: { type: "grid" as const, lineColor: null, spacing: 32 },
  };

  it("una hoja nueva recibe el fondo por defecto y se guarda en su archivo", async () => {
    await startWith("A");
    deps.defaultStyle = () => STYLE;
    const p = await createSheet(deps, "", "Cuadriculada");
    const shown = replaceScene.mock.calls.at(-1)![0];
    expect(shown.appState.viewBackgroundColor).toBe("#fff9db");
    expect(shown.appState.tuwBackground).toEqual(STYLE.tuwBackground);

    // el editor emite la escena con ese fondo → el primer autoguardado lo escribe en el archivo
    session.notifyChange(() =>
      serializeScene(shown.elements, shown.appState, shown.files),
    );
    await session.flush();
    const saved = JSON.parse(
      await fs.readFile(path.join(store.root, p), "utf8"),
    );
    expect(saved.appState.viewBackgroundColor).toBe("#fff9db");
    expect(saved.appState.tuwBackground).toEqual(STYLE.tuwBackground);
  });

  it("abrir una hoja que ya existía NO le cambia el fondo", async () => {
    await startWith("A");
    await store.createSheet("", "Vieja");
    deps.defaultStyle = () => STYLE;
    await openSheet(deps, "Vieja.excalidraw");
    const shown = replaceScene.mock.calls.at(-1)![0];
    expect(shown.appState.tuwBackground.type).toBe("plain");
    expect(shown.appState.viewBackgroundColor).not.toBe("#fff9db");
  });

  it("sin estilo por defecto la hoja nueva queda lisa", async () => {
    await startWith("A");
    deps.defaultStyle = () => null;
    await createSheet(deps, "", "B");
    expect(replaceScene.mock.calls.at(-1)![0].appState.tuwBackground.type).toBe(
      "plain",
    );
  });

  it("al borrar la única hoja, la 'Hoja 1' nueva también usa el estilo por defecto", async () => {
    const a = await startWith("Unica");
    deps.defaultStyle = () => STYLE;
    await trashItems(deps, [a]);
    expect(replaceScene.mock.calls.at(-1)![0].appState.tuwBackground.type).toBe(
      "grid",
    );
  });
});
