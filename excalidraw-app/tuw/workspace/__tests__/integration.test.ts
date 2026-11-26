// Integración: SheetSession (interfaz) + WorkspaceStore real (disco), unidos como lo hace el IPC.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toResult } from "../../../../desktop/src/workspace/result";
import { WorkspaceStore } from "../../../../desktop/src/workspace/store";
import { SheetSession } from "../sheetSession";
import { loadInitialSheet } from "../startup";
import { serializeScene } from "../sceneFile";

import type { SheetIO } from "../sheetSession";

let dir: string;
let store: WorkspaceStore;
let lastSheet: string | null;

const makeIO = (): SheetIO & {
  getInfo: () => Promise<any>;
  list: () => Promise<any>;
} => ({
  readSheet: (p) => toResult(() => store.readSheet(p)),
  writeSheet: (p, c, e, f) =>
    toResult(() => store.writeSheet(p, c, e, { force: f })),
  createSheet: (parent, name) =>
    toResult(() => store.createSheet(parent, name)),
  setLastSheet: async (p) => {
    lastSheet = p;
    return { ok: true, value: null };
  },
  getInfo: async () => ({ ok: true, value: { root: store.root, lastSheet } }),
  list: () => toResult(() => store.list()),
});

const newSession = () => {
  const events = { onConflict: vi.fn(), onError: vi.fn() };
  const session = new SheetSession(makeIO(), events, { debounceMs: 20 });
  return { session, events };
};

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "tuw-int-"));
  store = new WorkspaceStore(path.join(dir, "ws"));
  await store.init();
  lastSheet = null;
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const sceneText = (n: number) =>
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

describe("sesión + almacén real", () => {
  it("primer arranque: crea 'Hoja 1', autoguarda y al reabrir recupera lo guardado", async () => {
    const a = newSession();
    const first = await loadInitialSheet(makeIO(), a.session);
    expect(first.path).toBe("Hoja 1.excalidraw");

    a.session.notifyChange(() => sceneText(3));
    await a.session.flush();

    // "reinicio": sesión nueva sobre el mismo disco
    const b = newSession();
    const reopened = await loadInitialSheet(makeIO(), b.session);
    expect(reopened.path).toBe("Hoja 1.excalidraw");
    expect(reopened.scene.elements).toHaveLength(3);
  });

  it("reabrir sin cambios no reescribe el archivo", async () => {
    const a = newSession();
    await loadInitialSheet(makeIO(), a.session);
    a.session.notifyChange(() => sceneText(1));
    await a.session.flush();
    const file = path.join(store.root, "Hoja 1.excalidraw");
    const before = (await fs.stat(file)).mtimeMs;

    const b = newSession();
    const reopened = await loadInitialSheet(makeIO(), b.session);
    // el editor vuelve a emitir la misma escena al cargar
    b.session.notifyChange(() =>
      serializeScene(
        reopened.scene.elements!,
        reopened.scene.appState!,
        reopened.scene.files!,
      ),
    );
    await b.session.flush();
    expect((await fs.stat(file)).mtimeMs).toBe(before);
  });

  it("cambio externo: tu versión va a '(copia de conflicto)' y el archivo externo queda intacto", async () => {
    const a = newSession();
    await loadInitialSheet(makeIO(), a.session);
    a.session.notifyChange(() => sceneText(1));
    await a.session.flush();

    // otro programa (o Drive) reemplaza el archivo mientras la app lo tiene abierto
    const file = path.join(store.root, "Hoja 1.excalidraw");
    await fs.writeFile(
      file,
      '{"type":"excalidraw","version":2,"elements":[],"appState":{},"files":{},"x":"externo"}',
    );

    a.session.notifyChange(() => sceneText(5));
    await a.session.flush();

    expect(await fs.readFile(file, "utf8")).toContain('"x":"externo"');
    const copy = path.join(
      store.root,
      "Hoja 1 (copia de conflicto).excalidraw",
    );
    expect(JSON.parse(await fs.readFile(copy, "utf8")).elements).toHaveLength(
      5,
    );
    expect(a.events.onConflict).toHaveBeenCalledOnce();
    expect(lastSheet).toBe("Hoja 1 (copia de conflicto).excalidraw");
  });

  it("muchos cambios rápidos producen una sola escritura final con el último estado", async () => {
    const a = newSession();
    await loadInitialSheet(makeIO(), a.session);
    const spy = vi.spyOn(store, "writeSheet");
    for (let i = 1; i <= 30; i++) {
      a.session.notifyChange(() => sceneText(i));
    }
    await new Promise((r) => setTimeout(r, 120));
    expect(spy).toHaveBeenCalledTimes(1);
    const { content } = await store.readSheet("Hoja 1.excalidraw");
    expect(JSON.parse(content).elements).toHaveLength(30);
  });

  it("una hoja dañada en disco no se sobrescribe: se abre otra", async () => {
    await store.createSheet("", "Rota", "{ esto está roto");
    lastSheet = "Rota.excalidraw";
    const a = newSession();
    const opened = await loadInitialSheet(makeIO(), a.session);
    expect(opened.path).not.toBe("Rota.excalidraw");
    expect(
      await fs.readFile(path.join(store.root, "Rota.excalidraw"), "utf8"),
    ).toBe("{ esto está roto");
  });
});
