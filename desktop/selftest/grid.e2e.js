// Cuadrícula: con fondo cuadriculado, la línea recta del lápiz, la herramienta de línea y los ejes
// se pegan al vértice más cercano (separación 24). Eventos simulados.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sp = Element.prototype.setPointerCapture;
  Element.prototype.setPointerCapture = function (id) {
    try {
      return sp.call(this, id);
    } catch {
      /* eventos sintéticos */
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
      pointerId: type === "pen" ? 7 : 5,
      pointerType: type,
      isPrimary: true,
      button: 0,
      buttons: t === "pointerup" ? 0 : 1,
      pressure: t === "pointerup" ? 0 : 0.5,
      bubbles: true,
      cancelable: true,
      ...o,
    });

  // fondo cuadriculado (separación por defecto 24)
  document.querySelector('[data-testid="main-menu-trigger"]').click();
  await sleep(300);
  [...document.querySelectorAll("button, [role=menuitem], a")]
    .find((e) => e.textContent.trim().startsWith("Fondo de la hoja"))
    .click();
  await sleep(400);
  document.querySelector('[data-testid="tuw-bg-grid"]').click();
  await sleep(200);
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await sleep(400);

  // 1) línea recta del lápiz (puntos fuera de vértice)
  key("p");
  await sleep(150);
  canvas.dispatchEvent(pe("pen", "pointerdown", 503, 407));
  for (const [x, y] of [
    [560, 409],
    [620, 405],
    [700, 408],
  ]) {
    canvas.dispatchEvent(pe("pen", "pointermove", x, y));
    await sleep(30);
  }
  await sleep(800);
  canvas.dispatchEvent(pe("pen", "pointermove", 771, 411));
  await sleep(30);
  canvas.dispatchEvent(pe("pen", "pointerup", 771, 411));
  await sleep(300);

  // 2) herramienta de línea
  key("l");
  await sleep(150);
  canvas.dispatchEvent(pe("mouse", "pointerdown", 503, 607));
  for (const [x, y] of [
    [560, 640],
    [771, 711],
  ]) {
    canvas.dispatchEvent(pe("mouse", "pointermove", x, y));
    await sleep(30);
  }
  canvas.dispatchEvent(pe("mouse", "pointerup", 771, 711));
  await sleep(300);

  // 3) eje 3D arrastrando
  document.querySelector('[data-testid="tuw-axes-3d"]').click();
  await sleep(200);
  const ov = document.querySelector('[data-testid="tuw-axes-overlay"]');
  ov.dispatchEvent(pe("mouse", "pointerdown", 1003, 507));
  ov.dispatchEvent(pe("mouse", "pointermove", 1203, 357));
  await sleep(50);
  ov.dispatchEvent(pe("mouse", "pointerup", 1203, 357));
  await sleep(3500); // autoguardado

  const info = (await window.tuw.workspace.getInfo()).value;
  const els = JSON.parse(
    (await window.tuw.workspace.readSheet(info.lastSheet)).value.content,
  ).elements.filter((e) => !e.isDeleted);
  const ends = (e) => [
    [e.x + e.points[0][0], e.y + e.points[0][1]],
    [
      e.x + e.points[e.points.length - 1][0],
      e.y + e.points[e.points.length - 1][1],
    ],
  ];
  const onGrid = (pts) =>
    pts.every((p) =>
      p.every((v) => Math.abs(v / 24 - Math.round(v / 24)) < 1e-6),
    );
  const pen = els.find((e) => e.type === "freedraw");
  const lineEl = els.find((e) => e.type === "line");
  const axes = els.filter(
    (e) => e.customData?.tuw?.kind === "axis" && e.type === "arrow",
  );
  const z = axes.find((e) => e.customData.tuw.role === "z");
  const zEnds = z ? ends(z) : [];
  return {
    steps: {
      lapiz: {
        existe: !!pen,
        dosPuntos: !!pen && pen.points.length === 2,
        extremosEnVertices: !!pen && onGrid(ends(pen)),
      },
      linea: {
        existe: !!lineEl,
        extremosEnVertices: !!lineEl && onGrid(ends(lineEl)),
      },
      ejes: {
        seisFlechas: axes.length === 3,
        todosEnVertices:
          axes.length === 3 && axes.every((a) => onGrid(ends(a))),
        diagonal225:
          !!z &&
          Math.abs(
            Math.abs(zEnds[1][0] - zEnds[0][0]) -
              Math.abs(zEnds[1][1] - zEnds[0][1]),
          ) < 1e-6 &&
          zEnds[1][0] < zEnds[0][0] &&
          zEnds[1][1] > zEnds[0][1],
      },
      _info: {
        _pen: pen && ends(pen),
        _line: lineEl && ends(lineEl),
        _z: zEnds,
      },
    },
  };
})();
