import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { sheetGridSize } from "@excalidraw/excalidraw/scene/sheetBackground";
import { useEffect } from "react";

import type { ExcalidrawFreeDrawElement } from "@excalidraw/element/types";

import { appJotaiStore } from "../../app-jotai";

import { snapPoint } from "../axes/geometry";

import {
  HOLD_MS,
  HOLD_TOLERANCE_PX,
  canStraighten,
  isBarrelPressed,
  isLineLike,
} from "./penInput";

import { penSettingsAtom } from "./penState";

type Stroke = {
  id: number;
  start: { x: number; y: number }; // pantalla
  anchor: { x: number; y: number }; // dónde quedó quieto el lápiz
  last: { x: number; y: number; pressure: number };
  timer: number;
  snapped: boolean;
  /** Recorrido del lápiz (pantalla): solo se endereza si ya parece una línea. */
  path: { x: number; y: number }[];
  /** Punto de la hoja donde empezó el trazo, antes de pegarlo a la cuadrícula. */
  origin?: { x: number; y: number };
  /** Última forma de la línea: se reaplica al soltar (el editor agrega un punto final suelto). */
  fix?: { id: string; patch: Record<string, unknown> };
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
      // dónde empezó el trazo (se guarda la 1.ª vez: después el elemento puede moverse al vértice)
      const origin = (stroke!.origin ??= { x: el.x, y: el.y });
      let start = origin;
      const end = {
        x: (p.x - s.offsetLeft) / s.zoom.value - s.scrollX,
        y: (p.y - s.offsetTop) / s.zoom.value - s.scrollY,
      };
      // con cuadrícula en la hoja, solo el punto inicial se pega al vértice más cercano
      const grid = s.gridModeEnabled
        ? s.gridSize
        : sheetGridSize(s.tuwBackground);
      if (grid) {
        start = snapPoint(origin, grid);
      }
      const patch = {
        x: start.x,
        y: start.y,
        points: [
          [0, 0],
          [end.x - start.x, end.y - start.y],
        ] as any,
        pressures: el.simulatePressure
          ? []
          : [el.pressures[0] ?? 0.5, p.pressure],
      };
      api.mutateElement(el, patch);
      stroke!.fix = { id: el.id, patch };
      return true;
    };

    const snap = () => {
      if (
        !stroke ||
        stroke.snapped ||
        !canStraighten(stroke.start, stroke.last) ||
        !isLineLike(stroke.path)
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
      const settings = appJotaiStore.get(penSettingsAtom);
      if (
        (e.pointerType !== "pen" && e.pointerType !== "mouse") ||
        e.button > 0 ||
        isBarrelPressed(e) ||
        !settings.straightHold ||
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
        path: [pt],
      };
      armTimer();
    };

    const onMove = (ev: Event) => {
      const e = ev as PointerEvent;
      if (!stroke || e.pointerId !== stroke.id) {
        return;
      }
      stroke.last = { x: e.clientX, y: e.clientY, pressure: e.pressure };
      if (!stroke.snapped) {
        const prev = stroke.path[stroke.path.length - 1];
        if (Math.hypot(e.clientX - prev.x, e.clientY - prev.y) >= 1) {
          stroke.path.push({ x: e.clientX, y: e.clientY });
        }
      }
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
    // al soltar, el editor suma un último punto con la posición real del lápiz: se deja la recta limpia
    const onUp = () => {
      const fix = stroke?.snapped ? stroke.fix : undefined;
      stop();
      if (fix) {
        window.setTimeout(() => {
          const el = api
            .getSceneElementsIncludingDeleted()
            .find((e) => e.id === fix.id);
          if (el && el.type === "freedraw") {
            api.mutateElement(el, fix.patch as any);
          }
        }, 0);
      }
    };
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", stop, true);
    return () => {
      stop();
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", stop, true);
    };
  }, [api]);

  return null;
};
