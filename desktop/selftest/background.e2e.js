// Fondo de hoja en la app real: elegir "Cuadriculado" y comprobar que se guarda en el archivo.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('[data-testid="main-menu-trigger"]').click();
  await sleep(300);
  [...document.querySelectorAll("button, [role=menuitem], a")]
    .find((e) => e.textContent.trim().startsWith("Fondo de la hoja"))
    .click();
  await sleep(400);
  document.querySelector('[data-testid="tuw-bg-grid"]').click();
  await sleep(200);
  document.querySelector('.tuw-bg__swatch[aria-label="Fondo #fff9db"]').click();
  await sleep(3000); // autoguardado (1,5 s)
  const info = (await window.tuw.workspace.getInfo()).value;
  const read = (await window.tuw.workspace.readSheet(info.lastSheet)).value;
  const saved = JSON.parse(read.content).appState;
  return {
    hoja: info.lastSheet,
    guardado: {
      tuwBackground: saved.tuwBackground,
      viewBackgroundColor: saved.viewBackgroundColor,
    },
  };
})();
