// Segunda apertura: la hoja que se dibujó antes debe cargarse con sus elementos.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(1500);
  const info = (await window.tuw.workspace.getInfo()).value;
  const read = (await window.tuw.workspace.readSheet(info.lastSheet)).value;
  const doc = JSON.parse(read.content);
  const enDisco = doc.elements.filter((e) => !e.isDeleted).length;
  // la pantalla muestra lo mismo: el lienzo no está en blanco
  const canvas = document.querySelector("canvas.static");
  const ctx = canvas.getContext("2d");
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let tinta = 0;
  for (let i = 0; i < d.length; i += 4 * 7) {
    if (d[i] < 120 && d[i + 1] < 120 && d[i + 2] < 120 && d[i + 3] > 0) {
      tinta++;
    }
  }
  return {
    steps: {
      persistencia: { hayElementos: enDisco >= 1 && tinta > 20 },
    },
  };
})();
