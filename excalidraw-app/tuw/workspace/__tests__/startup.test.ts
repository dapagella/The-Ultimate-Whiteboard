import { describe, expect, it, vi } from "vitest";

import { loadInitialSheet } from "../startup";

import type { SheetVersion, TreeNode } from "../../../../desktop/src/api";

const ver: SheetVersion = { mtimeMs: 1, size: 1, hash: "a".repeat(64) };
const EMPTY =
  '{"type":"excalidraw","version":2,"elements":[],"appState":{},"files":{}}';

const sheet = (path: string): TreeNode => ({
  type: "sheet",
  name: path,
  path,
  mtimeMs: 0,
  size: 0,
});

const makeIO = (opts: {
  lastSheet?: string | null;
  files?: Record<string, string>;
  tree?: TreeNode[];
}) => {
  const files = { ...(opts.files ?? {}) };
  const createSheet = vi.fn(async (_parent: string, name: string) => {
    const path = `${name}.excalidraw`;
    files[path] = EMPTY;
    return { ok: true as const, value: { path, version: ver } };
  });
  return {
    files,
    createSheet,
    io: {
      getInfo: async () => ({
        ok: true as const,
        value: { root: "C:/ws", lastSheet: opts.lastSheet ?? null },
      }),
      list: async () => ({ ok: true as const, value: opts.tree ?? [] }),
      readSheet: async (p: string) =>
        p in files
          ? { ok: true as const, value: { content: files[p], version: ver } }
          : { ok: false as const, error: { code: "NOT_FOUND", message: "no" } },
      createSheet,
    },
  };
};

const fakeSession = () => ({ open: vi.fn() } as any);

describe("loadInitialSheet", () => {
  it("abre la última hoja usada", async () => {
    const { io } = makeIO({
      lastSheet: "A.excalidraw",
      files: { "A.excalidraw": EMPTY },
    });
    const session = fakeSession();
    const r = await loadInitialSheet(io, session);
    expect(r.path).toBe("A.excalidraw");
    expect(session.open).toHaveBeenCalledWith(
      "A.excalidraw",
      EMPTY,
      ver,
      expect.any(String), // texto de referencia para no reescribir al abrir
    );
  });

  it("si la última ya no existe abre la primera hoja del espacio de trabajo (también dentro de carpetas)", async () => {
    const { io } = makeIO({
      lastSheet: "Borrada.excalidraw",
      files: { "Mate/Uno.excalidraw": EMPTY },
      tree: [
        {
          type: "folder",
          name: "Mate",
          path: "Mate",
          children: [sheet("Mate/Uno.excalidraw")],
        },
      ],
    });
    const r = await loadInitialSheet(io, fakeSession());
    expect(r.path).toBe("Mate/Uno.excalidraw");
  });

  it("si no hay hojas crea 'Hoja 1'", async () => {
    const { io, createSheet } = makeIO({});
    const session = fakeSession();
    const r = await loadInitialSheet(io, session);
    expect(createSheet).toHaveBeenCalledWith("", "Hoja 1");
    expect(r.path).toBe("Hoja 1.excalidraw");
    expect(session.open).toHaveBeenCalledOnce();
  });

  it("una hoja dañada se salta y NO se sobrescribe", async () => {
    const { io, files, createSheet } = makeIO({
      lastSheet: "Rota.excalidraw",
      files: { "Rota.excalidraw": "{ basura" },
      tree: [sheet("Rota.excalidraw")],
    });
    const session = fakeSession();
    const r = await loadInitialSheet(io, session);
    expect(files["Rota.excalidraw"]).toBe("{ basura");
    expect(createSheet).toHaveBeenCalled(); // no había otra válida: se creó una nueva
    expect(r.path).not.toBe("Rota.excalidraw");
  });

  it("prefiere otra hoja válida antes que crear una nueva", async () => {
    const { io, createSheet } = makeIO({
      lastSheet: "Rota.excalidraw",
      files: { "Rota.excalidraw": "{ basura", "Buena.excalidraw": EMPTY },
      tree: [sheet("Buena.excalidraw"), sheet("Rota.excalidraw")],
    });
    const r = await loadInitialSheet(io, fakeSession());
    expect(r.path).toBe("Buena.excalidraw");
    expect(createSheet).not.toHaveBeenCalled();
  });
});
