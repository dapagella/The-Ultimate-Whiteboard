import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { useEffect } from "react";

import { appJotaiStore, useAtom } from "../../app-jotai";
import { axesModeAtom } from "../axes/axesState";

import {
  DEFAULT_UI_SCALE,
  MAX_UI_SCALE,
  MIN_UI_SCALE,
  hidesMenusWhileDrawing,
  saveUiScale,
  uiHiddenAtom,
  uiScaleAtom,
  uiScaleDialogAtom,
} from "./uiState";

import "./ui.scss";

/**
 * - Aplica el tamaño de la interfaz (menús y paneles).
 * - Esconde los menús al empezar a dibujar y los vuelve a mostrar al tocar un botón de la barra.
 */
export const UiChrome = () => {
  const api = useExcalidrawAPI();
  const [scale] = useAtom(uiScaleAtom);
  const [hidden] = useAtom(uiHiddenAtom);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--tuw-ui-scale",
      String(scale / 100),
    );
  }, [scale]);

  useEffect(() => {
    document.body.classList.toggle("tuw-ui-hidden", hidden);
    return () => document.body.classList.remove("tuw-ui-hidden");
  }, [hidden]);

  useEffect(() => {
    if (!api) {
      return;
    }
    const setHidden = (v: boolean) => {
      if (appJotaiStore.get(uiHiddenAtom) !== v) {
        appJotaiStore.set(uiHiddenAtom, v);
      }
    };

    // al empezar a dibujar sobre la hoja: se esconden los menús
    const onDown = (ev: Event) => {
      const e = ev as PointerEvent;
      const target = e.target as HTMLElement | null;
      if (e.button > 0 || !target?.closest?.("canvas.interactive")) {
        return;
      }
      if (
        hidesMenusWhileDrawing(api.getAppState().activeTool.type) ||
        appJotaiStore.get(axesModeAtom)
      ) {
        setHidden(true);
      }
    };
    // al tocar cualquier botón de la barra de funciones: se vuelven a mostrar
    const onToolbar = (ev: Event) => {
      const target = ev.target as HTMLElement | null;
      if (target?.closest?.(".shapes-section")) {
        setHidden(false);
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerdown", onToolbar, true);
    // con la selección o la manito no hace falta esconder nada
    const off = api.onChange((_els, state) => {
      if (
        appJotaiStore.get(uiHiddenAtom) &&
        !hidesMenusWhileDrawing(state.activeTool.type) &&
        !appJotaiStore.get(axesModeAtom)
      ) {
        setHidden(false);
      }
    });
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerdown", onToolbar, true);
      off?.();
    };
  }, [api]);

  return null;
};

/** ☰ → "Tamaño de la interfaz…": porcentaje de los menús y paneles. */
export const UiScaleDialog = () => {
  const [open, setOpen] = useAtom(uiScaleDialogAtom);
  const [scale] = useAtom(uiScaleAtom);

  if (!open) {
    return null;
  }
  return (
    <Dialog
      size="small"
      title="Tamaño de la interfaz"
      onCloseRequest={() => setOpen(false)}
    >
      <div className="tuw-uiscale" data-testid="tuw-uiscale-dialog">
        <p>
          Achica o agranda los menús y paneles. La hoja y los dibujos no
          cambian.
        </p>
        <div className="tuw-uiscale__row">
          <input
            type="range"
            min={MIN_UI_SCALE}
            max={MAX_UI_SCALE}
            step={5}
            value={scale}
            aria-label="Tamaño de la interfaz"
            data-testid="tuw-uiscale-range"
            onChange={(e) => saveUiScale(Number(e.target.value))}
          />
          <label>
            <input
              type="number"
              min={MIN_UI_SCALE}
              max={MAX_UI_SCALE}
              value={scale}
              data-testid="tuw-uiscale-number"
              onChange={(e) => saveUiScale(Number(e.target.value))}
            />
            %
          </label>
        </div>
        <div className="tuw-uiscale__presets">
          {[60, 70, 80, 90, 100, 120].map((p) => (
            <button
              key={p}
              className={p === scale ? "is-on" : ""}
              onClick={() => saveUiScale(p)}
            >
              {p}%
            </button>
          ))}
          <button onClick={() => saveUiScale(DEFAULT_UI_SCALE)}>
            Restablecer
          </button>
        </div>
      </div>
    </Dialog>
  );
};
