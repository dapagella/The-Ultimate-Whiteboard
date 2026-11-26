// Clic derecho en el panel de hojas: el menú aparece, se ve (no queda tapado) y tiene las opciones.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rows = () => [
    ...document.querySelectorAll('[data-testid="tuw-ex-row"]'),
  ];
  await window.tuw.workspace.createFolder("", "Carpeta A");
  await window.tuw.workspace.createSheet("", "Hoja 2");
  document.querySelector('[data-testid="main-menu-trigger"]').click();
  await sleep(300);
  [...document.querySelectorAll("button, [role=menuitem], a")]
    .find((e) => e.textContent.trim() === "Hojas y carpetas")
    .click();
  await sleep(1200);

  const out = {};
  const open = async (row) => {
    const r = row.getBoundingClientRect();
    row.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: r.left + 40,
        clientY: r.top + 10,
        button: 2,
      }),
    );
    await sleep(250);
    const menu = document.querySelector(".tuw-ex__menu");
    if (!menu) {
      return null;
    }
    const b = menu.getBoundingClientRect();
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + 10);
    return {
      items: [...menu.querySelectorAll('[role="menuitem"]')].map((x) =>
        x.textContent.trim(),
      ),
      visible: b.width > 50 && b.height > 30,
      noTapado: !!top && menu.contains(top),
      _debug: {
        _top: top && (top.className || top.tagName),
        _rect: [b.left, b.top, b.width, b.height],
        _win: [innerWidth, innerHeight],
      },
    };
  };
  const close = async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await sleep(150);
  };

  const folder = rows().find((r) => r.textContent.includes("Carpeta A"));
  const sheet = rows().find((r) => r.textContent.includes("Hoja 2"));
  const mf = folder && (await open(folder));
  await close();
  const ms = sheet && (await open(sheet));
  await close();
  // clic derecho en un espacio vacío del panel: crear en la raíz
  const panel = document.querySelector('[data-testid="tuw-explorer"]');
  panel.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 600,
    }),
  );
  await sleep(250);
  const mr = document.querySelector(".tuw-ex__menu");
  out.carpeta = {
    abre: !!mf,
    visible: mf?.visible === true,
    noTapado: mf?.noTapado === true,
    nuevaCarpetaAqui: !!mf?.items.includes("Nueva carpeta aquí"),
    renombrar: !!mf?.items.some((i) => i.startsWith("Renombrar")),
    mover: !!mf?.items.some((i) => i.startsWith("Mover a")),
    eliminar: !!mf?.items.some((i) => /papelera/i.test(i)),
  };
  out.hoja = {
    abre: !!ms,
    visible: ms?.visible === true,
    noTapado: ms?.noTapado === true,
    duplicar: !!ms?.items.includes("Duplicar"),
    exportar: !!ms?.items.some((i) => i.startsWith("Exportar")),
  };
  out.vacio = { abre: !!mr };
  // "Nueva carpeta aquí" sobre una carpeta crea la subcarpeta ADENTRO
  await close();
  await open(folder);
  [...document.querySelectorAll('.tuw-ex__menu [role="menuitem"]')]
    .find((x) => x.textContent.includes("Nueva carpeta aquí"))
    .click();
  await sleep(500);
  document.activeElement?.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  await sleep(800);
  const tree = (await window.tuw.workspace.list()).value;
  const a = tree.find((n) => n.name === "Carpeta A");
  out.subcarpeta = {
    creada: !!a && (a.children || []).some((c) => c.type === "folder"),
  };
  out._d = { _m: mf?._debug, _h: ms?._debug };
  return { steps: out, _items: { _carpeta: mf?.items, _hoja: ms?.items } };
})();
