import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { useEffect } from "react";

import type { ExcalidrawFreeDrawElement } from "@excalidraw/element/types";

import { appJotaiStore } from "../../app-jotai";

import {
  HOLD_MS,
  HOLD_TOLERANCE_PX,
  canStraighten,
  isBarrelPressed,
} from "./penInput";
import { penSettingsAtom } from "./penState";

type Stroke = {
  id: number;
  start: { x: number; y: number }; // pantalla
  anchor: { x: number; y: number }; // dónde quedó quieto el lápiz
  last: { x: number; y: number; pressure: number };
  timer: number;
  snapped: boolean;
};

/**
 * Dibujando con el lápiz (herramienta de dibujo libre): si se mantiene quieto ~0,5 s, el trazo se
 * convierte en una línea recta desde donde empezó hasta el lápiz, y sigue al lápiz hasta que se levanta.
 * Usa el trazo que el editor ya está dibujando (no toca el editor).
 */
export const StraightLineGuard = () => {
  const api = useExcalidrawAPI();

  useEffect(() => {
    if (!api) {
      return;
    }
    let stroke: Stroke | null = null;

    const stop = () => {
      if (stroke) {
        window.clearTimeout(stroke.timer);
      }
      stroke = null;
    };

    // línea recta desde el comienzo del trazo hasta el punto de pantalla indicado
    const setEnd = (p: { x: number; y: number; pressure: number }) => {
      const s = api.getAppState();
      const el = s.newElement as ExcalidrawFreeDrawElement | null;
      if (!el || el.type !== "freedraw") {
        return false;
      }
      const dx = (p.x - s.offsetLeft) / s.zoom.value - s.scrollX - el.x;
      const dy = (p.y - s.offsetTop) / s.zoom.value - s.scrollY - el.y;
      api.mutateElement(el, {
        points: [
          [0, 0],
          [dx, dy],
        ] as any,
        pressures: el.simulatePressure
          ? []
          : [el.pressures[0] ?? 0.5, p.pressure],
      });
      return true;
    };

    const snap = () => {
      if (
        !stroke ||
        stroke.snapped ||
        !canStraighten(stroke.start, stroke.last)
      ) {
        return;
      }
      if (setEnd(stroke.last)) {
        stroke.snapped = true;
      }
    };

    const armTimer = () => {
      if (stroke) {
        window.clearTimeout(stroke.timer);
        stroke.timer = window.setTimeout(snap, HOLD_MS);
      }
    };

    const onDown = (ev: Event) => {
      const e = ev as PointerEvent;
      stop();
      if (
        e.pointerType !== "pen" ||
        e.button > 0 ||
        isBarrelPressed(e) ||
        !appJotaiStore.get(penSettingsAtom).straightHold ||
        api.getAppState().activeTool.type !== "freedraw" ||
        !(e.target as HTMLElement | null)?.closest?.("canvas.interactive")
      ) {
        return;
      }
      const pt = { x: e.clientX, y: e.clientY };
      stroke = {
        id: e.pointerId,
        start: pt,
        anchor: pt,
        last: { ...pt, pressure: e.pressure },
        timer: 0,
        snapped: false,
      };
      armTimer();
    };

    const onMove = (ev: Event) => {
      const e = ev as PointerEvent;
      if (!stroke || e.pointerId !== stroke.id) {
        return;
      }
      stroke.last = { x: e.clientX, y: e.clientY, pressure: e.pressure };
      if (stroke.snapped) {
        // la línea sigue al lápiz; el editor no agrega puntos al trazo
        e.stopImmediatePropagation();
        setEnd(stroke.last);
        return;
      }
      if (
        Math.hypot(e.clientX - stroke.anchor.x, e.clientY - stroke.anchor.y) >
        HOLD_TOLERANCE_PX
      ) {
        stroke.anchor = { x: e.clientX, y: e.clientY };
        armTimer();
      }
    };

    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", stop, true);
    window.addEventListener("pointercancel", stop, true);
    return () => {
      stop();
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", stop, true);
      window.removeEventListener("pointercancel", stop, true);
    };
  }, [api]);

  return null;
};
