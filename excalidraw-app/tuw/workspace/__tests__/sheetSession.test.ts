import { describe, expect, it, vi } from "vitest";

import { SheetSession } from "../sheetSession";

import type { SheetIO } from "../sheetSession";
import type { SheetVersion } from "../../../../desktop/src/api";

const v = (n: number): SheetVersion => ({
  mtimeMs: n,
  size: n,
  hash: String(n).padStart(64, "0"),
});

/** Disco falso en memoria con detección de conflictos como el real. */
const makeFakeDisk = () => {
  const files = new Map<string, { content: string; version: SheetVersion }>();
  let counter = 1;
  const writes: { path: string; content: string }[] = [];
  const io: SheetIO = {
    readSheet: async (path) => {
      const f = files.get(path);
      return f
        ? { ok: true, value: f }
        : { ok: false, error: { code: "NOT_FOUND", message: "no existe" } };
    },
    writeSheet: async (path, content, expected, force) => {
      const cur = files.get(path);
      if (cur && !force && (!expected || expected.hash !== cur.version.hash)) {
        return {
          ok: true,
          value: { ok: false, conflict: true, current: cur.version },
        };
      }
      const version = v(++counter);
      files.set(path, { content, version });
      writes.push({ path, content });
      return { ok: true, value: { ok: true, version } };
    },
    createSheet: async (parent, name) => {
      let n = name;
      let i = 2;
      while (files.has(`${parent ? `${parent}/` : ""}${n}.excalidraw`)) {
        n = `${name} (${i++})`;
      }
      const path = `${parent ? `${parent}/` : ""}${n}.excalidraw`;
      const version = v(++counter);
      files.set(path, { content: "{}", version });
      return { ok: true, value: { path, version } };
    },
    setLastSheet: vi.fn(async () => ({ ok: true as const, value: null })),
  };
  return { files, writes, io };
};

const setup = (opts: { debounceMs?: number } = {}) => {
  const disk = makeFakeDisk();
  const timers = new Map<number, () => void>();
  let nextId = 1;
  const events = { onConflict: vi.fn(), onError: vi.fn() };
  const session = new SheetSession(disk.io, events, {
    debounceMs: opts.debounceMs ?? 1500,
    setTimer: (fn) => {
      timers.set(nextId, fn);
      return nextId++;
    },
    clearTimer: (id) => void timers.delete(id as number),
  });
  const fireTimers = async () => {
    const fns = [...timers.values()];
    timers.clear();
    fns.forEach((f) => f());
    await new Promise((r) => setTimeout(r, 0));
  };
  disk.files.set("Hoja.excalidraw", { content: "v0", version: v(1) });
  session.open("Hoja.excalidraw", "v0", v(1));
  return { disk, session, events, timers, fireTimers };
};

describe("SheetSession", () => {
  it("guarda una sola vez después del retraso, con el último estado", async () => {
    const { session, disk, timers, fireTimers } = setup();
    session.notifyChange(() => "a");
    session.notifyChange(() => "b");
    session.notifyChange(() => "c");
    expect(timers.size).toBe(1); // cada cambio reinicia el temporizador
    expect(disk.writes).toHaveLength(0);
    await fireTimers();
    expect(disk.writes).toEqual([{ path: "Hoja.excalidraw", content: "c" }]);
  });

  it("no serializa en cada cambio, solo cuando toca guardar", async () => {
    const { session, fireTimers } = setup();
    const produce = vi.fn(() => "x");
    for (let i = 0; i < 50; i++) {
      session.notifyChange(produce);
    }
    expect(produce).not.toHaveBeenCalled();
    await fireTimers();
    expect(produce).toHaveBeenCalledTimes(1);
  });

  it("no escribe si el contenido guardado es idéntico (scroll, selección…)", async () => {
    const { session, disk, fireTimers } = setup();
    session.notifyChange(() => "v0");
    await fireTimers();
    expect(disk.writes).toHaveLength(0);
  });

  it("flush guarda de inmediato y cancela el temporizador", async () => {
    const { session, disk, timers } = setup();
    session.notifyChange(() => "pendiente");
    await session.flush();
    expect(disk.files.get("Hoja.excalidraw")!.content).toBe("pendiente");
    expect(timers.size).toBe(0);
  });

  it("flush sin cambios pendientes no hace nada", async () => {
    const { session, disk } = setup();
    await session.flush();
    expect(disk.writes).toHaveLength(0);
  });

  it("guardados consecutivos usan la versión devuelta (sin falsos conflictos)", async () => {
    const { session, disk, events } = setup();
    session.notifyChange(() => "1");
    await session.flush();
    session.notifyChange(() => "2");
    await session.flush();
    session.notifyChange(() => "3");
    await session.flush();
    expect(disk.files.get("Hoja.excalidraw")!.content).toBe("3");
    expect(events.onConflict).not.toHaveBeenCalled();
  });

  it("una escritura a la vez: un cambio durante un guardado se guarda después", async () => {
    const { session, disk } = setup();
    let release!: () => void;
    const original = disk.io.writeSheet;
    let first = true;
    disk.io.writeSheet = async (...args) => {
      if (first) {
        first = false;
        await new Promise<void>((r) => (release = r));
      }
      return original(...args);
    };
    session.notifyChange(() => "uno");
    const f1 = session.flush();
    await new Promise((r) => setTimeout(r, 0));
    session.notifyChange(() => "dos");
    const f2 = session.flush();
    release();
    await Promise.all([f1, f2]);
    expect(disk.writes.map((w) => w.content)).toEqual(["uno", "dos"]);
  });

  it("si el archivo cambió afuera, tu versión va a una copia y la sesión sigue en ella", async () => {
    const { session, disk, events } = setup();
    // otro programa modifica el archivo
    disk.files.set("Hoja.excalidraw", { content: "externo", version: v(99) });
    session.notifyChange(() => "mío");
    await session.flush();

    expect(disk.files.get("Hoja.excalidraw")!.content).toBe("externo"); // no se pisó
    const copy = "Hoja (copia de conflicto).excalidraw";
    expect(disk.files.get(copy)!.content).toBe("mío");
    expect(events.onConflict).toHaveBeenCalledWith({
      originalPath: "Hoja.excalidraw",
      copyPath: copy,
    });
    expect(session.currentPath).toBe(copy);

    // los próximos guardados van a la copia, sin más conflictos
    session.notifyChange(() => "mío 2");
    await session.flush();
    expect(disk.files.get(copy)!.content).toBe("mío 2");
    expect(events.onConflict).toHaveBeenCalledTimes(1);
  });

  it("conserva la carpeta al crear la copia de conflicto", async () => {
    const { session, disk } = setup();
    disk.files.set("Mate/Uno.excalidraw", { content: "x", version: v(5) });
    session.open("Mate/Uno.excalidraw", "x", v(4)); // versión vieja → conflicto
    session.notifyChange(() => "mío");
    await session.flush();
    expect(disk.files.has("Mate/Uno (copia de conflicto).excalidraw")).toBe(
      true,
    );
  });

  it("si falla el guardado avisa y reintenta con el próximo cambio", async () => {
    const { session, disk, events } = setup();
    const original = disk.io.writeSheet;
    disk.io.writeSheet = async () => ({
      ok: false,
      error: {
        code: "IO_ERROR",
        message: "No hay espacio suficiente en el disco.",
      },
    });
    session.notifyChange(() => "x");
    await session.flush();
    expect(events.onError).toHaveBeenCalledWith(
      "No hay espacio suficiente en el disco.",
    );

    disk.io.writeSheet = original;
    await session.flush(); // el contenido pendiente sigue ahí
    expect(disk.files.get("Hoja.excalidraw")!.content).toBe("x");
  });

  it("sin hoja abierta ignora los cambios", async () => {
    const disk = makeFakeDisk();
    const session = new SheetSession(disk.io, {
      onConflict: vi.fn(),
      onError: vi.fn(),
    });
    session.notifyChange(() => "x");
    await session.flush();
    expect(disk.writes).toHaveLength(0);
  });

  it("al abrir otra hoja descarta lo pendiente de la anterior", async () => {
    const { session, disk, fireTimers } = setup();
    session.notifyChange(() => "de la hoja vieja");
    disk.files.set("Otra.excalidraw", { content: "o", version: v(7) });
    session.open("Otra.excalidraw", "o", v(7));
    await fireTimers();
    expect(disk.writes).toHaveLength(0);
  });
});
