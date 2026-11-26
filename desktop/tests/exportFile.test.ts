import { describe, expect, it, vi } from "vitest";

import { decodeExport, exportFileName } from "../src/exportFile";

vi.mock("electron", () => ({
  app: { getPath: () => "C:\\Docs" },
  dialog: {},
  ipcMain: { handle: () => {} },
}));

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

describe("exportFileName", () => {
  it("agrega la extensión del formato (la hoja se guarda como .excalidraw)", () => {
    expect(exportFileName("Álgebra", "png")).toBe("Álgebra.png");
    expect(exportFileName("Álgebra", "svg")).toBe("Álgebra.svg");
    expect(exportFileName("Álgebra", "json")).toBe("Álgebra.excalidraw");
  });

  it("limpia caracteres inválidos en Windows y extensiones repetidas", () => {
    expect(exportFileName('a<b>:c/d\\e|f?g*"h', "png")).toBe(
      "a_b__c_d_e_f_g__h.png",
    );
    expect(exportFileName("Hoja 1.excalidraw", "svg")).toBe("Hoja 1.svg");
    expect(exportFileName("fin. . ", "png")).toBe("fin.png");
  });

  it("nombres vacíos o reservados caen a 'Hoja'", () => {
    for (const bad of ["", "   ", "CON", "nul", "lpt1", undefined, 5]) {
      expect(exportFileName(bad, "png"), String(bad)).toBe("Hoja.png");
    }
  });

  it("no se pasa de 100 caracteres", () => {
    expect(exportFileName("x".repeat(500), "png").length).toBe(104);
  });
});

describe("decodeExport (la interfaz no es de confianza)", () => {
  it("acepta un PNG en base64, un SVG y una hoja", () => {
    expect(
      decodeExport({
        format: "png",
        suggestedName: "a",
        content: png.toString("base64"),
      }).ok,
    ).toBe(true);
    expect(
      decodeExport({
        format: "svg",
        suggestedName: "a",
        content: '<?xml version="1.0"?><svg xmlns="x"/>',
      }).ok,
    ).toBe(true);
    expect(
      decodeExport({
        format: "json",
        suggestedName: "a",
        content: '{"type":"excalidraw","elements":[]}',
      }).ok,
    ).toBe(true);
  });

  it("rechaza contenido que no es del tipo pedido", () => {
    const content = Buffer.from("MZ programa").toString("base64");
    expect(
      decodeExport({ format: "png", suggestedName: "a", content }).ok,
    ).toBe(false);
    expect(
      decodeExport({
        format: "svg",
        suggestedName: "a",
        content: "<html></html>",
      }).ok,
    ).toBe(false);
    expect(
      decodeExport({ format: "json", suggestedName: "a", content: '{"x":1}' })
        .ok,
    ).toBe(false);
    expect(
      decodeExport({ format: "json", suggestedName: "a", content: "no json" })
        .ok,
    ).toBe(false);
  });

  it("rechaza formatos raros, vacíos y pedidos mal formados", () => {
    for (const req of [
      null,
      "x",
      { format: "exe", suggestedName: "a", content: "abc" },
      { format: "png", suggestedName: "a", content: "" },
      { format: "png", suggestedName: "a" },
    ]) {
      expect(decodeExport(req as any).ok).toBe(false);
    }
  });
});
