import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  WORKSPACE_FOLDER_NAME,
  readSettings,
  resolveWorkspaceRoot,
  writeSettings,
} from "../src/settings";

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "tuw-settings-"));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("readSettings / writeSettings", () => {
  it("devuelve {} si el archivo no existe o está dañado", async () => {
    expect(await readSettings(path.join(dir, "no.json"))).toEqual({});
    await fs.writeFile(path.join(dir, "mal.json"), "{ esto no es json");
    expect(await readSettings(path.join(dir, "mal.json"))).toEqual({});
  });

  it("guarda y lee (creando la carpeta) sin dejar temporales", async () => {
    const file = path.join(dir, "sub", "settings.json");
    await writeSettings(file, {
      workspaceRoot: "C:/x",
      lastSheet: "a/b.excalidraw",
    });
    expect(await readSettings(file)).toEqual({
      workspaceRoot: "C:/x",
      lastSheet: "a/b.excalidraw",
    });
    expect(await fs.readdir(path.dirname(file))).toEqual(["settings.json"]);
  });

  it("ignora campos con tipo incorrecto", async () => {
    const file = path.join(dir, "s.json");
    await fs.writeFile(
      file,
      JSON.stringify({ workspaceRoot: 5, lastSheet: {} }),
    );
    expect(await readSettings(file)).toEqual({
      workspaceRoot: undefined,
      lastSheet: null,
    });
  });
});

describe("resolveWorkspaceRoot", () => {
  it("usa la carpeta elegida si está vacía", async () => {
    const empty = path.join(dir, "vacia");
    await fs.mkdir(empty);
    expect(await resolveWorkspaceRoot(empty)).toBe(empty);
  });

  it("usa la carpeta elegida si no existe todavía", async () => {
    const nueva = path.join(dir, "nueva");
    expect(await resolveWorkspaceRoot(nueva)).toBe(nueva);
  });

  it("crea una subcarpeta si la elegida tiene archivos ajenos (p. ej. Documentos)", async () => {
    await fs.writeFile(path.join(dir, "tesis.docx"), "x");
    expect(await resolveWorkspaceRoot(dir)).toBe(
      path.join(dir, WORKSPACE_FOLDER_NAME),
    );
  });

  it("reutiliza un espacio de trabajo existente (tiene .tuw) o una carpeta con el nombre de la app", async () => {
    const ws = path.join(dir, "mio");
    await fs.mkdir(path.join(ws, ".tuw"), { recursive: true });
    await fs.writeFile(path.join(ws, "hoja.excalidraw"), "{}");
    expect(await resolveWorkspaceRoot(ws)).toBe(ws);
    const named = path.join(dir, WORKSPACE_FOLDER_NAME);
    await fs.mkdir(named);
    await fs.writeFile(path.join(named, "x.txt"), "x");
    expect(await resolveWorkspaceRoot(named)).toBe(named);
  });
});
