// Presets de trazo en la app real: dibujar con el resaltador y comprobar que se guarda con su modo de mezcla.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const canvas = document.querySelector("canvas.interactive");
  const ev = (type, x, y) =>
    canvas.dispatchEvent(
      new PointerEvent(type, {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        pressure: 0.5,
        isPrimary: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  const draw = async (pts) => {
    ev("pointerdown", pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) {
      ev("pointermove", x, y);
      await sleep(8);
    }
    ev("pointerup", pts.at(-1)[0], pts.at(-1)[1]);
    await sleep(150);
  };
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "p", code: "KeyP", bubbles: true }),
  );
  await sleep(300);
  const bar = document.querySelector('[data-testid="tuw-strokes"]');
  if (!bar) {
    return { error: "no apareció la barra de presets" };
  }
  document.querySelector('[data-testid="tuw-stroke-pen"]').click();
  await sleep(200);
  await draw([
    [300, 300],
    [400, 310],
    [500, 300],
  ]);
  document.querySelector('[data-testid="tuw-stroke-highlighter"]').click();
  await sleep(200);
  await draw([
    [320, 305],
    [420, 305],
    [520, 305],
  ]);
  await sleep(3000); // autoguardado
  const info = (await window.tuw.workspace.getInfo()).value;
  const read = (await window.tuw.workspace.readSheet(info.lastSheet)).value;
  const els = JSON.parse(read.content).elements.map((e) => ({
    type: e.type,
    strokeWidth: e.strokeWidth,
    opacity: e.opacity,
    stroke: e.customData?.tuw?.stroke ?? null,
  }));
  return {
    presetsVisibles: [...bar.querySelectorAll("[data-testid^=tuw-stroke-]")]
      .length,
    guardado: els,
  };
})();
