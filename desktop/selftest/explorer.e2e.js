// Guion de prueba del explorador: se ejecuta DENTRO de la ventana de Electron
// (TUW_SELFTEST_SCRIPT=desktop/selftest/explorer.e2e.js). Devuelve un objeto con resultados.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, ms = 4000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      const v = fn();
      if (v) {
        return v;
      }
      await sleep(25);
    }
    return null;
  };
  const rows = () => [
    ...document.querySelectorAll('[data-testid="tuw-ex-row"]'),
  ];
  const row = (p) => rows().find((r) => r.getAttribute("data-path") === p);
  const click = (el, opts = {}) =>
    el.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, ...opts }),
    );
  const setInput = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const settle = () => sleep(120); // deja que React vuelva a dibujar (como pasa entre acciones humanas)
  const panelError = () =>
    document.querySelector(".tuw-ex__error")?.textContent ?? null;
  const out = { steps: {}, errors: [] };
  const step = async (name, fn) => {
    try {
      out.steps[name] = await fn();
    } catch (e) {
      out.steps[name] = `ERROR: ${e}`;
      out.errors.push(name);
    }
  };
  const button = (label) =>
    [...document.querySelectorAll("button")].find(
      (b) =>
        b.textContent.trim() === label ||
        b.getAttribute("aria-label") === label,
    );

  // 1. abrir el panel desde el menú principal y medir cuánto tarda el árbol
  await step("abrirPanel", async () => {
    const t0 = performance.now();
    document.querySelector('[data-testid="main-menu-trigger"]').click();
    const item = await waitFor(() =>
      [...document.querySelectorAll("button, [role=menuitem], a")].find(
        (e) => e.textContent.trim() === "Hojas y carpetas",
      ),
    );
    if (!item) {
      return "no se encontró el ítem del menú";
    }
    item.click();
    const ok = await waitFor(() => rows().length >= 30);
    return {
      ok: !!ok,
      ms: Math.round(performance.now() - t0),
      filasIniciales: rows().length,
    };
  });

  // 2. 300 hojas visibles a la vez (la búsqueda despliega todo)
  await step("render330Filas", async () => {
    const t0 = performance.now();
    setInput(document.querySelector(".tuw-ex__search"), "H");
    const ok = await waitFor(() => rows().length >= 330, 5000);
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    ); // incluye pintar
    const ms = Math.round(performance.now() - t0);
    const filas = rows().length;
    setInput(document.querySelector(".tuw-ex__search"), "");
    await settle();
    return { ok: !!ok, filas, ms };
  });

  // 3. crear carpeta y renombrarla en el lugar
  await step("crearCarpeta", async () => {
    button("Nueva carpeta").click();
    const input = await waitFor(() =>
      document.querySelector(".tuw-ex__rename"),
    );
    if (!input) {
      return "no apareció el campo de nombre";
    }
    setInput(input, "Prueba");
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    return { ok: !!(await waitFor(() => row("Prueba"))), error: panelError() };
  });

  // 4. abrir otra hoja con un clic (expandiendo su carpeta)
  await step("abrirOtraHoja", async () => {
    await settle();
    click(row("F05"));
    await settle();
    const r = await waitFor(() => row("F05/H03.excalidraw"));
    if (!r) {
      return { error: "no se expandió F05" };
    }
    click(r);
    const active = await waitFor(() =>
      row("F05/H03.excalidraw")?.classList.contains("is-active"),
    );
    return { activa: !!active, error: panelError() };
  });

  // 5. selección múltiple con ctrl
  await step("seleccionMultiple", async () => {
    await settle();
    click(row("F05/H01.excalidraw"), { ctrlKey: true });
    click(row("F05/H02.excalidraw"), { ctrlKey: true });
    await settle();
    return rows()
      .filter((r) => r.getAttribute("aria-selected") === "true")
      .map((r) => r.getAttribute("data-path"));
  });

  // 6. arrastrar y soltar (los eventos de arrastre se mandan como lo haría el navegador)
  const drag = async (fromPath, toPath) => {
    const dt = new DataTransfer();
    const from = row(fromPath);
    const to =
      toPath === "" ? document.querySelector(".tuw-ex__list") : row(toPath);
    from.dispatchEvent(
      new DragEvent("dragstart", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      }),
    );
    await sleep(60);
    to.dispatchEvent(
      new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      }),
    );
    const dropEffect = dt.dropEffect;
    to.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      }),
    );
    from.dispatchEvent(
      new DragEvent("dragend", { bubbles: true, dataTransfer: dt }),
    );
    await sleep(400);
    return dropEffect;
  };
  await step("arrastrarSeleccionMultipleAPrueba", async () => {
    // H01, H02 y H03 están seleccionadas: arrastrar una arrastra las tres
    const efecto = await drag("F05/H03.excalidraw", "Prueba");
    const salieron = await waitFor(
      () =>
        !row("F05/H01.excalidraw") &&
        !row("F05/H02.excalidraw") &&
        !row("F05/H03.excalidraw"),
    );
    const llegaron = await waitFor(
      () =>
        row("Prueba/H01.excalidraw") &&
        row("Prueba/H02.excalidraw") &&
        row("Prueba/H03.excalidraw"),
      2000,
    );
    return {
      efecto,
      salieronDeOrigen: !!salieron,
      llegaronAPrueba: !!llegaron,
      error: panelError(),
    };
  });
  await step("carpetaDentroDeSiMismaBloqueada", async () => {
    await settle();
    const efecto = await drag("Prueba", "Prueba"); // intenta soltar igual
    return {
      efecto,
      sigueEnLaRaiz: !!row("Prueba"),
      conserva3Hojas: !!(
        row("Prueba/H01.excalidraw") && row("Prueba/H03.excalidraw")
      ),
    };
  });
  await step("carpetaALaRaizDondeYaEstaBloqueado", async () => {
    await settle();
    const efecto = await drag("F00", "");
    return { efecto, sigueEnLaRaiz: !!row("F00") };
  });
  await step("hojaDeCarpetaALaRaiz", async () => {
    await settle();
    click(row("F06"));
    await settle();
    const antes = !!(await waitFor(() => row("F06/H00.excalidraw")));
    click(row("F06/H00.excalidraw"));
    await settle();
    const efecto = await drag("F06/H00.excalidraw", ""); // soltar en el fondo del panel = raíz
    const enRaiz = await waitFor(() => row("H00.excalidraw"), 2000);
    return {
      antes,
      efecto,
      llegoALaRaiz: !!enRaiz,
      salioDeF06: !row("F06/H00.excalidraw"),
      error: panelError(),
    };
  });

  // 7. borrar con Delete → confirmación → papelera
  await step("borrarConConfirmacion", async () => {
    click(row("F02"));
    await settle();
    const r = await waitFor(() => row("F02/H05.excalidraw"));
    click(r);
    await settle();
    document
      .querySelector(".tuw-ex__list")
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
      );
    const confirmBtn = await waitFor(() =>
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === "Mover a la papelera",
      ),
    );
    if (!confirmBtn) {
      return "no apareció la confirmación";
    }
    confirmBtn.click();
    return { desaparecio: !!(await waitFor(() => !row("F02/H05.excalidraw"))) };
  });

  // 8. papelera: aparece y se restaura
  await step("papeleraYRestaurar", async () => {
    button("Papelera").click();
    const item = await waitFor(() =>
      document.querySelector('[data-testid="tuw-ex-trash-item"]'),
    );
    if (!item) {
      return "la papelera está vacía";
    }
    const info = item.textContent;
    [...item.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Restaurar")
      .click();
    await waitFor(
      () => !document.querySelector('[data-testid="tuw-ex-trash-item"]'),
    );
    button("← Volver").click();
    return {
      info: info.slice(0, 80),
      volvio: !!(await waitFor(() => row("F02/H05.excalidraw"), 3000)),
    };
  });

  // 9. renombrar con F2 (una sola vez aunque se pierda el foco después de Enter)
  await step("renombrarConF2", async () => {
    click(row("F03"));
    await settle();
    const r = await waitFor(() => row("F03/H00.excalidraw"));
    click(r);
    await settle();
    document
      .querySelector(".tuw-ex__list")
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "F2", bubbles: true }),
      );
    const input = await waitFor(() =>
      document.querySelector(".tuw-ex__rename"),
    );
    if (!input) {
      return "no apareció el campo";
    }
    setInput(input, "Renombrada");
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    const ok = await waitFor(() => row("F03/Renombrada.excalidraw"));
    return { ok: !!ok, error: panelError() };
  });

  await sleep(1800); // deja terminar los guardados
  out.errorEnPanel = panelError();
  out.filasFinales = rows().length;
  return out;
})();
