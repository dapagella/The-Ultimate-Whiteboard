import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { newImageElement } from "@excalidraw/element";
import { describe, expect, it } from "vitest";

import type { BinaryFiles } from "@excalidraw/excalidraw/types";

import { parseScene } from "../../workspace/sceneFile";
import { EmptySheetError, buildExportContent } from "../exportSheet";

const files = {
  f1: {
    id: "f1",
    mimeType: "image/svg+xml",
    dataURL: "data:image/svg+xml;base64,PHN2Zy8+",
    created: 1,
  },
} as unknown as BinaryFiles;

const latexImage = () =>
  newImageElement({
    type: "image",
    status: "saved",
    fileId: "f1" as any,
    x: 10,
    y: 20,
    width: 120,
    height: 60,
    customData: { tuw: { latex: { source: "x^2", displayMode: true } } },
  });

describe("exportar hoja (JSON)", () => {
  it("ida y vuelta: la hoja exportada se reimporta sin pérdidas (fórmula, imagen y fondo)", async () => {
    const appState = {
      ...getDefaultAppState(),
      viewBackgroundColor: "#fff9db",
      tuwBackground: {
        type: "grid" as const,
        lineColor: "#112233",
        spacing: 40,
      },
    };
    const content = await buildExportContent(
      { elements: [latexImage()], appState, files },
      { format: "json", scale: 1, background: true },
    );
    const back = parseScene(content);
    const img = back.elements!.find((e) => e.type === "image")!;
    expect((img.customData as any).tuw.latex.source).toBe("x^2");
    expect(img.width).toBe(120);
    expect(back.files!.f1.dataURL).toBe(files.f1.dataURL);
    expect(back.appState!.viewBackgroundColor).toBe("#fff9db");
    expect((back.appState as any).tuwBackground).toEqual({
      type: "grid",
      lineColor: "#112233",
      spacing: 40,
    });
  });

  it("una hoja vacía no se exporta", async () => {
    await expect(
      buildExportContent(
        { elements: [], appState: getDefaultAppState(), files: {} },
        { format: "png", scale: 1, background: true },
      ),
    ).rejects.toBeInstanceOf(EmptySheetError);
  });
});
