// Tras un Ctrl+V real (lo manda main.ts), la hoja debe tener la imagen pegada, guardada en el archivo.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(2500); // autoguardado
  const info = (await window.tuw.workspace.getInfo()).value;
  const read = (await window.tuw.workspace.readSheet(info.lastSheet)).value;
  const doc = JSON.parse(read.content);
  const el = doc.elements.find((e) => e.type === "image" && !e.isDeleted);
  return {
    steps: {
      pegado: {
        hayImagen: !!el,
        medida: el ? [el.width, el.height] : null,
        tamanoOriginal:
          !!el && Math.round(el.width) === 80 && Math.round(el.height) === 50,
        guardadaEnArchivo:
          !!el &&
          String(doc.files[el.fileId]?.dataURL).startsWith("data:image/png"),
      },
    },
  };
})();
