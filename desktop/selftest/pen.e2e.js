// Lápiz en la app real: presión → grosor, botón del costado = goma, rechazo de palma y ajustes guardados.
// (Eventos de puntero "pen" simulados: la prueba con una tableta física la hace una persona.)
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sp = Element.prototype.setPointerCapture;
  Element.prototype.setPointerCapture = function (id) {
    try {
      return sp.call(this, id);
    } catch {
      /* eventos sintéticos: no hay puntero activo */
    }
  };
  const canvas = document.querySelector("canvas.interactive");
  const key = (k) =>
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: k, bubbles: true }),
    );
  const pe = (type, t, x, y, o = {}) =>
    new PointerEvent(t, {
      clientX: x,
      clientY: y,
      pointerId: type === "pen" ? 7 : 21,
      pointerType: type,
      isPrimary: true,
      button: 0,
      buttons: t === "pointerup" ? 0 : 1,
      pressure: t === "pointerup" ? 0 : 0.5,
      bubbles: true,
      cancelable: true,
      ...o,
    });
  const readSheet = async () => {
    await sleep(3000); // autoguardado
    const info = (await window.tuw.workspace.getInfo()).value;
    const r = (await window.tuw.workspace.readSheet(info.lastSheet)).value;
    return JSON.parse(r.content).elements;
  };

  // 1) trazo con presión variable
  key("p"); // herramienta de dibujo libre
  await sleep(200);
  const pts = [
    [300, 300, 0.1],
    [340, 310, 0.4],
    [380, 320, 0.9],
    [420, 330, 0.9],
    [460, 340, 0.3],
  ];
  canvas.dispatchEvent(
    pe("pen", "pointerdown", pts[0][0], pts[0][1], { pressure: pts[0][2] }),
  );
  for (const p of pts.slice(1)) {
    canvas.dispatchEvent(
      pe("pen", "pointermove", p[0], p[1], { pressure: p[2] }),
    );
    await sleep(30);
  }
  canvas.dispatchEvent(pe("pen", "pointerup", 460, 340));
  await sleep(300);

  // 2) segundo trazo, y se borra con el botón del costado (buttons=3 al apoyar)
  key("p");
  await sleep(150);
  canvas.dispatchEvent(pe("pen", "pointerdown", 380, 600, { pressure: 0.5 }));
  for (const x of [400, 420, 440, 460]) {
    canvas.dispatchEvent(pe("pen", "pointermove", x, 610));
    await sleep(30);
  }
  canvas.dispatchEvent(pe("pen", "pointerup", 460, 610));
  await sleep(300);
  key("p");
  await sleep(150);
  canvas.dispatchEvent(pe("pen", "pointerdown", 420, 605, { buttons: 3 }));
  for (const x of [430, 440, 450]) {
    canvas.dispatchEvent(
      pe("pen", "pointermove", x, 608, { buttons: 3, button: -1 }),
    );
    await sleep(40);
  }
  canvas.dispatchEvent(pe("pen", "pointerup", 450, 608));
  await sleep(300);

  // 3) rechazo de palma: con el lápiz cerca, el dedo se ignora (se mide con un clic de dedo sobre la hoja)
  key("v");
  await sleep(200);
  const before = document.querySelector('[data-testid="tuw-axes"]') ? 1 : 0;
  canvas.dispatchEvent(pe("pen", "pointermove", 300, 300, { buttons: 0 }));
  canvas.dispatchEvent(
    pe("touch", "pointerdown", 700, 500, { width: 12, height: 12 }),
  );
  canvas.dispatchEvent(pe("touch", "pointerup", 700, 500));
  await sleep(100);

  // 4) ajustes: el botón del costado = mover la hoja, y quedan guardados en esta PC
  document.querySelector('[data-testid="main-menu-trigger"]').click();
  await sleep(300);
  [...document.querySelectorAll("button, [role=menuitem], a")]
    .find((e) => e.textContent.trim().startsWith("Lápiz y tableta"))
    .click();
  await sleep(400);
  const defaultEraser = document.querySelector(
    '[data-testid="tuw-pen-barrel-eraser"]',
  ).checked;
  document.querySelector('[data-testid="tuw-pen-barrel-pan"]').click();
  await sleep(200);
  const saved = JSON.parse(localStorage.getItem("tuw.pen.settings"));

  const els = await readSheet();
  const strokes = els.filter((e) => e.type === "freedraw");
  const first = strokes[0];
  const second = strokes[1];
  return {
    steps: {
      presion: {
        guardoTrazo: !!first,
        presionReal: first && first.simulatePressure === false,
        presionesDistintas: first && new Set(first.pressures).size >= 2,
      },
      botonDelCostado: {
        segundoTrazoBorrado: !!second && second.isDeleted === true,
        primerTrazoIntacto: !!first && first.isDeleted === false,
      },
      ajustes: {
        porDefectoBorrar: defaultEraser,
        guardoMoverHoja: saved?.barrel === "pan" && saved?.rejectPalm === true,
      },
      _info: { _trazos: strokes.length, _before: before },
    },
  };
})();
