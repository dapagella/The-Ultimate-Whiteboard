// Contenido en la app real: imagen por URL (descarga desde el proceso principal) y fórmulas LaTeX.
// El runner (desktop/scripts/selftest-content.mjs) antepone `const PORT = <puerto del servidor de prueba>;`.
/* global PORT */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const base = `http://127.0.0.1:${PORT}`;
  const steps = {};

  const fetchOne = async (url) => {
    const r = await window.tuw.fetchImage(url);
    return r.ok
      ? {
          ok: true,
          mime: r.value.mimeType,
          name: r.value.name,
          bytes: r.value.bytes,
        }
      : { ok: false, msg: r.error.message };
  };

  // 1) la capa de descarga (reglas de seguridad)
  const ok = await fetchOne(`${base}/ok.png`);
  const fake = await fetchOne(`${base}/fake.png`);
  const redir = await fetchOne(`${base}/redir`);
  const file = await fetchOne("file:///C:/Windows/win.ini");
  const big = await fetchOne(`${base}/big`);
  const notFound = await fetchOne(`${base}/nada`);
  steps.descarga = {
    pngOk: ok.ok && ok.mime === "image/png" && ok.name === "ok.png",
    rechazaHtmlDisfrazado: fake.ok === false,
    siguePeroValidaRedireccion: redir.ok === true && redir.mime === "image/png",
    rechazaFile: file.ok === false,
    rechazaMasDe15MB: big.ok === false && /15 MB/.test(big.msg),
    errorHttp404: notFound.ok === false && /404/.test(notFound.msg),
  };

  // 2) por la interfaz: botón "Imagen URL"
  document.querySelector('[data-testid="tuw-insert-url"]').click();
  await sleep(300);
  const input = document.querySelector('[data-testid="tuw-imageurl-input"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
    input,
    `${base}/ok.png`,
  );
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await sleep(100);
  document.querySelector('[data-testid="tuw-imageurl-submit"]').click();
  await sleep(1500);
  const dialogCerrado = !document.querySelector(
    '[data-testid="tuw-imageurl-dialog"]',
  );

  // 3) por la interfaz: fórmula de ejemplo (\int_0^1 x^2\,dx)
  document.querySelector('[data-testid="tuw-insert-latex"]').click();
  await sleep(1500);
  const vistaPrevia = !!document.querySelector(
    '[data-testid="tuw-latex-preview"] img',
  );
  document.querySelector('[data-testid="tuw-latex-accept"]').click();
  await sleep(1000);

  await sleep(3000); // autoguardado
  const info = (await window.tuw.workspace.getInfo()).value;
  const read = (await window.tuw.workspace.readSheet(info.lastSheet)).value;
  const doc = JSON.parse(read.content);
  const imgs = doc.elements.filter((e) => e.type === "image" && !e.isDeleted);
  const url = imgs.find((e) => !e.customData?.tuw?.latex);
  const tex = imgs.find((e) => e.customData?.tuw?.latex);
  steps.interfaz = {
    dialogoURLCerrado: dialogCerrado,
    vistaPreviaFormula: vistaPrevia,
    guardoImagenURL: !!url && doc.files[url.fileId]?.mimeType === "image/png",
    guardoFormula:
      !!tex &&
      tex.customData.tuw.latex.source === "\\int_0^1 x^2\\,dx" &&
      doc.files[tex.fileId]?.mimeType === "image/svg+xml",
    formulaTamanoRazonable:
      !!tex && tex.width > 40 && tex.height > 40 && tex.height < 400,
  };

  // 4) la fórmula guardada se dibuja en un canvas sin "contaminarlo" (necesario para exportar PNG)
  if (tex) {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error("no cargó el SVG"));
      img.src = doc.files[tex.fileId].dataURL;
    });
    const c = document.createElement("canvas");
    c.width = Math.ceil(tex.width);
    c.height = Math.ceil(tex.height);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    let tainted = false;
    let dark = 0;
    try {
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] < 100 && d[i + 1] < 100 && d[i + 2] < 100) {
          dark++;
        }
      }
    } catch {
      tainted = true;
    }
    steps.exportarPNG = {
      canvasNoContaminado: !tainted,
      dibujaTinta: dark > 200,
    };
  }
  return { steps, detalle: { ok, fake, redir, file, big, notFound } };
})();
