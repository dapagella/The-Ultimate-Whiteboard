import { newElement } from "@excalidraw/element";
import { describe, expect, it } from "vitest";

import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import { InvalidSceneError, parseScene, serializeScene } from "../sceneFile";

const rect = (extra: Record<string, unknown> = {}): ExcalidrawElement =>
  newElement({
    type: "rectangle",
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    ...extra,
  }) as ExcalidrawElement;

describe("serializeScene / parseScene", () => {
  it("ida y vuelta conserva elementos y customData de TUW", () => {
    const el = rect({
      customData: { tuw: { kind: "axis", dim: 2, angleZDeg: 225 } },
    });
    const text = serializeScene(
      [el],
      { viewBackgroundColor: "#ffeeaa" } as Partial<AppState>,
      {},
    );
    const scene = parseScene(text);
    expect(scene.elements).toHaveLength(1);
    expect(scene.elements![0].id).toBe(el.id);
    expect(scene.elements![0].customData).toEqual({
      tuw: { kind: "axis", dim: 2, angleZDeg: 225 },
    });
    expect(scene.appState!.viewBackgroundColor).toBe("#ffeeaa");
  });

  it("produce un archivo .excalidraw estándar (abrible en excalidraw.com)", () => {
    const data = JSON.parse(serializeScene([rect()], {}, {}));
    expect(data.type).toBe("excalidraw");
    expect(data.version).toBe(2);
    expect(Array.isArray(data.elements)).toBe(true);
    expect(data.files).toEqual({});
  });

  it("las imágenes viajan embebidas en `files` y vuelven al abrir", () => {
    const image = {
      id: "img1",
      type: "image",
      fileId: "file1",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    } as unknown as ExcalidrawElement;
    const files: BinaryFiles = {
      file1: {
        id: "file1" as any,
        mimeType: "image/png",
        dataURL: "data:image/png;base64,AAAA" as any,
        created: 1,
      },
    };
    const scene = parseScene(serializeScene([image], {}, files));
    expect(scene.files!.file1.dataURL).toBe("data:image/png;base64,AAAA");
  });

  it("no guarda imágenes de elementos borrados", () => {
    const image = {
      id: "img1",
      type: "image",
      fileId: "file1",
      isDeleted: true,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    } as unknown as ExcalidrawElement;
    const files: BinaryFiles = {
      file1: {
        id: "file1" as any,
        mimeType: "image/png",
        dataURL: "data:x" as any,
        created: 1,
      },
    };
    expect(JSON.parse(serializeScene([image], {}, files)).files).toEqual({});
  });

  it("la salida es estable: mismo estado → mismo texto (clave para no re-escribir)", () => {
    const el = rect();
    const a = serializeScene([el], { viewBackgroundColor: "#fff" }, {});
    const b = serializeScene([el], { viewBackgroundColor: "#fff" }, {});
    expect(a).toBe(b);
  });

  it("el scroll y la selección no cambian lo que se guarda", () => {
    const el = rect();
    const a = serializeScene(
      [el],
      { scrollX: 0, scrollY: 0 } as Partial<AppState>,
      {},
    );
    const b = serializeScene(
      [el],
      {
        scrollX: 500,
        scrollY: -300,
        selectedElementIds: { [el.id]: true },
      } as Partial<AppState>,
      {},
    );
    expect(a).toBe(b);
  });
});

describe("parseScene rechaza archivos inválidos", () => {
  it("JSON roto, otro tipo de archivo o elementos que no son lista", () => {
    for (const bad of [
      "{ no es json",
      "[]",
      "null",
      '{"type":"otro"}',
      '{"type":"excalidraw","elements":5}',
    ]) {
      expect(() => parseScene(bad), bad).toThrow(InvalidSceneError);
    }
  });

  it("acepta una hoja vacía", () => {
    const scene = parseScene(
      '{"type":"excalidraw","version":2,"elements":[],"appState":{},"files":{}}',
    );
    expect(scene.elements).toEqual([]);
  });
});
