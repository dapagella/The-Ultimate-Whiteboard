// Exportar hoja en la app real: fórmula + fondo cuadriculado → PNG, SVG y .excalidraw.
// Los archivos se escriben en TUW_EXPORT_DIR (sin diálogo, solo en pruebas) y los revisa export.check.mjs.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clickMenu = async (prefix) => {
    document.querySelector('[data-testid="main-menu-trigger"]').click();
    await sleep(300);
    [...document.querySelectorAll("button, [role=menuitem], a")]
      .find((e) => e.textContent.trim().startsWith(prefix))
      .click();
    await sleep(400);
  };

  // contenido: una fórmula y fondo cuadriculado amarillo
  document.querySelector('[data-testid="tuw-insert-latex"]').click();
  await sleep(1500);
  document.querySelector('[data-testid="tuw-latex-accept"]').click();
  await sleep(800);
  await clickMenu("Fondo de la hoja");
  document.querySelector('[data-testid="tuw-bg-grid"]').click();
  await sleep(200);
  document.querySelector('.tuw-bg__swatch[aria-label="Fondo #fff9db"]').click();
  await sleep(300);
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await sleep(400);

  const out = {};
  for (const fmt of ["png", "svg", "pdf", "json"]) {
    await clickMenu("Exportar imagen o PDF");
    document.querySelector(`[data-testid="tuw-export-${fmt}"]`).click();
    await sleep(100);
    document.querySelector('[data-testid="tuw-export-go"]').click();
    let msg = null;
    for (let i = 0; i < 50 && !msg; i++) {
      await sleep(200);
      msg = document.querySelector('[data-testid="tuw-export-msg"]');
    }
    out[fmt] = msg ? msg.textContent : "sin mensaje";
    // cerrar el diálogo
    [...document.querySelectorAll(".tuw-export__btn")]
      .find((b) => /Cerrar|Cancelar/.test(b.textContent))
      ?.click();
    await sleep(400);
  }
  return {
    steps: {
      mensajes: {
        png: /^Guardado en: .*Hoja\.png$/.test(out.png),
        svg: /^Guardado en: .*Hoja\.svg$/.test(out.svg),
        json: /^Guardado en: .*Hoja\.excalidraw$/.test(out.json),
      },
      _raw: { _png: out.png, _svg: out.svg, _pdf: out.pdf, _json: out.json },
    },
  };
})();
