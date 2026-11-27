import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { useEffect } from "react";

import { appJotaiStore } from "../../app-jotai";

import { latexDialogAtom } from "./contentState";
import { readLatexData } from "./latex/latexSvg";

import "./content.scss";

/** ¿El punto (en coordenadas de la hoja) cae dentro del elemento, aunque esté girado? */
export const hitsElement = (
  el: { x: number; y: number; width: number; height: number; angle: number },
  px: number,
  py: number,
) => {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const cos = Math.cos(-el.angle);
  const sin = Math.sin(-el.angle);
  const dx = px - cx;
  const dy = py - cy;
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;
  return Math.abs(rx) <= el.width / 2 && Math.abs(ry) <= el.height / 2;
};

/**
 * Botones "Fórmula" e "Imagen URL" + doble clic sobre una fórmula para editarla.
 */
export const ContentBar = () => {
  const api = useExcalidrawAPI();

  useEffect(() => {
    if (!api) {
      return;
    }
    // en fase de captura: así Excalidraw no arranca su propio "recortar imagen" con el doble clic
    const onDblClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest?.(".excalidraw canvas.interactive")) {
        return;
      }
      const s = api.getAppState();
      const ids = Object.keys(s.selectedElementIds).filter(
        (id) => s.selectedElementIds[id],
      );
      if (ids.length !== 1) {
        return;
      }
      const el = api
        .getSceneElements()
        .find((x) => x.id === ids[0] && x.type === "image");
      if (!el || !readLatexData(el.customData)) {
        return;
      }
      const px = (e.clientX - s.offsetLeft) / s.zoom.value - s.scrollX;
      const py = (e.clientY - s.offsetTop) / s.zoom.value - s.scrollY;
      if (!hitsElement(el, px, py)) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      appJotaiStore.set(latexDialogAtom, { mode: "edit", id: el.id });
    };
    window.addEventListener("dblclick", onDblClick, true);
    return () => window.removeEventListener("dblclick", onDblClick, true);
  }, [api]);

  // los botones "Fórmula" e "Imagen URL" están en la barra de funciones de arriba
  return null;
};
