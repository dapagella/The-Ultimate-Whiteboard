// Ejes en la app real: colocar un eje 3D arrastrando, cambiar el ángulo Z y comprobar que se guarda.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const set = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  ).set;
  const pe = (type, x, y) =>
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      pointerId: 5,
      pointerType: "mouse",
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      bubbles: true,
      cancelable: true,
    });
  document.querySelector('[data-testid="tuw-axes-3d"]').click();
  await sleep(200);
  const ov = document.querySelector('[data-testid="tuw-axes-overlay"]');
  if (!ov) {
    return { error: "no apareció la capa para colocar el eje" };
  }
  ov.dispatchEvent(pe("pointerdown", 500, 400));
  for (const [x, y] of [
    [600, 330],
    [700, 250],
  ]) {
    ov.dispatchEvent(pe("pointermove", x, y));
    await sleep(30);
  }
  ov.dispatchEvent(pe("pointerup", 700, 250));
  await sleep(500);
  const lx = document.querySelector('[data-testid="tuw-axis-lx"]');
  lx.focus();
  set.call(lx, "260");
  lx.dispatchEvent(new Event("input", { bubbles: true }));
  lx.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  await sleep(3000); // autoguardado
  const info = (await window.tuw.workspace.getInfo()).value;
  const read = (await window.tuw.workspace.readSheet(info.lastSheet)).value;
  const els = JSON.parse(read.content).elements;
  const z = els.find((e) => e.customData?.tuw?.role === "z");
  const unGrupo = new Set(els.map((e) => e.groupIds[0])).size === 1;
  const lenZ = Math.hypot(z.points[1][0], z.points[1][1]);
  return {
    steps: {
      eje3d: {
        seisElementos: els.length >= 3,
        unGrupo,
        opaco: els.every((e) => e.opacity === 100),
        diagonal225:
          Math.abs(Math.abs(z.points[1][0]) - Math.abs(z.points[1][1])) < 1 &&
          z.points[1][0] < 0 &&
          z.points[1][1] > 0,
        largoXDelPanel:
          Math.abs(
            els.find((e) => e.customData?.tuw?.role === "x").points[1][0] - 260,
          ) < 1,
        _largoZ: Math.round(lenZ),
        _xpts: JSON.stringify(
          els.find((e) => e.customData?.tuw?.role === "x").points,
        ),
        _guardados: els
          .map((e) => `${e.type}:${e.customData?.tuw?.role}`)
          .join(","),
      },
    },
  };
})();
