// Revisa los archivos que dejó export.e2e.js. Devuelve la lista de problemas (vacía = todo bien).
import fs from "node:fs";
import path from "node:path";

export default (dir) => {
  const problems = [];
  const read = (n) => {
    const p = path.join(dir, n);
    if (!fs.existsSync(p)) {
      problems.push(`falta ${n}`);
      return null;
    }
    return fs.readFileSync(p);
  };

  const png = read("Hoja.png");
  if (png) {
    const magic = [0x89, 0x50, 0x4e, 0x47].every((b, i) => png[i] === b);
    if (!magic) problems.push("Hoja.png no es un PNG");
    if (png.length < 2000)
      problems.push(`Hoja.png sospechosamente chico (${png.length} B)`);
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    if (w < 100 || h < 50) problems.push(`Hoja.png con tamaño raro ${w}x${h}`);
  }

  const pdf = read("Hoja.pdf");
  if (pdf) {
    if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-")
      problems.push("Hoja.pdf no es un PDF");
    if (!pdf.subarray(-16).toString("latin1").trimEnd().endsWith("%%EOF"))
      problems.push("Hoja.pdf termina mal");
    if (!pdf.toString("latin1").includes("/FlateDecode"))
      problems.push("Hoja.pdf sin imagen");
    if (pdf.length < 3000)
      problems.push(`Hoja.pdf sospechosamente chico (${pdf.length} B)`);
  }

  const svg = read("Hoja.svg")?.toString("utf8");
  if (svg) {
    if (!/<svg[\s>]/.test(svg)) problems.push("Hoja.svg no es un SVG");
    if (!/<pattern/.test(svg))
      problems.push("Hoja.svg no incluye el fondo cuadriculado");
    if (!/<image/.test(svg))
      problems.push("Hoja.svg no incluye la fórmula (imagen)");
    if (!/fff9db/i.test(svg))
      problems.push("Hoja.svg no tiene el color de fondo de la hoja");
  }

  const raw = read("Hoja.excalidraw")?.toString("utf8");
  if (raw) {
    let doc;
    try {
      doc = JSON.parse(raw);
    } catch {
      problems.push("Hoja.excalidraw no es JSON");
    }
    if (doc) {
      if (doc.type !== "excalidraw")
        problems.push("Hoja.excalidraw: type incorrecto");
      const img = (doc.elements || []).find(
        (e) => e.type === "image" && e.customData?.tuw?.latex,
      );
      if (!img) problems.push("Hoja.excalidraw no trae la fórmula");
      else if (!doc.files?.[img.fileId]?.dataURL)
        problems.push(
          "Hoja.excalidraw no trae la imagen de la fórmula embebida (no es autocontenido)",
        );
      if (doc.appState?.tuwBackground?.type !== "grid")
        problems.push("Hoja.excalidraw perdió el fondo cuadriculado");
      if (doc.appState?.viewBackgroundColor?.toLowerCase() !== "#fff9db")
        problems.push("Hoja.excalidraw perdió el color de fondo");
    }
  }
  return problems;
};
