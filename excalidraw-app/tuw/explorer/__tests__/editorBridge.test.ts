import { describe, expect, it, vi } from "vitest";

import { parseScene, serializeScene } from "../../workspace/sceneFile";
import { makeEditorBridge } from "../editorBridge";

const fakeApi = () => {
  const api: any = {
    isDestroyed: false,
    addFiles: vi.fn(),
    updateScene: vi.fn(),
    setViewport: vi.fn(),
    history: { clear: vi.fn() },
  };
  return api;
};

describe("makeEditorBridge.replaceScene", () => {
  it("aplica solo el estado persistente: NO reinicia el panel abierto, la herramienta ni la selección", () => {
    const api = fakeApi();
    const scene = parseScene(
      serializeScene([], { viewBackgroundColor: "#ffeeaa" }, {}),
    );
    // restoreAppState completa con valores por defecto de la interfaz
    expect(scene.appState).toHaveProperty("openSidebar");

    makeEditorBridge(api).replaceScene(scene);

    const applied = api.updateScene.mock.calls[0][0].appState;
    expect(applied.viewBackgroundColor).toBe("#ffeeaa");
    for (const uiKey of [
      "openSidebar",
      "openMenu",
      "openDialog",
      "activeTool",
      "selectedElementIds",
      "editingTextElement",
      "scrollX",
      "scrollY",
      "zoom",
    ]) {
      expect(applied, uiKey).not.toHaveProperty(uiKey);
    }
  });

  it("limpia el historial y no deja el cambio como deshacible", () => {
    const api = fakeApi();
    makeEditorBridge(api).replaceScene(parseScene(serializeScene([], {}, {})));
    expect(api.history.clear).toHaveBeenCalledOnce();
    expect(api.updateScene.mock.calls[0][0].captureUpdate).toBe("NEVER");
  });

  it("agrega las imágenes embebidas al editor", () => {
    const api = fakeApi();
    const file = {
      id: "f1",
      mimeType: "image/png",
      dataURL: "data:x",
      created: 1,
    };
    makeEditorBridge(api).replaceScene({
      elements: [],
      appState: {},
      files: { f1: file as any },
    });
    expect(api.addFiles).toHaveBeenCalledWith([file]);
  });
});
