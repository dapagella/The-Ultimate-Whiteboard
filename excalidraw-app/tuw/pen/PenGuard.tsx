import { useEffect } from "react";

import { appJotaiStore } from "../../app-jotai";

import {
  isBarrelPressed,
  isPen,
  retargetFor,
  shouldRejectTouch,
} from "./penInput";
import { penSettingsAtom } from "./penState";

import type { BarrelAction, Phase } from "./penInput";

const ON_CANVAS = "canvas.interactive";
const SELF = Symbol("tuw-pen-retargeted");

/**
 * Rechazo de palma y botón del costado del lápiz. Escucha en fase de captura (antes que el editor),
 * solo sobre el lienzo, y reenvía el evento "disfrazado" cuando hace falta. No toca el editor.
 */
export const PenGuard = () => {
  useEffect(() => {
    let lastPenAt = -Infinity;
    // mientras el botón del costado sigue apretado desde que se apoyó la punta
    let session: { id: number; action: BarrelAction } | null = null;
    let suppressMenuUntil = 0;

    const onCanvas = (e: Event) =>
      !!(e.target as HTMLElement | null)?.closest?.(ON_CANVAS);

    const redispatch = (
      e: PointerEvent,
      phase: Phase,
      action: BarrelAction,
    ) => {
      const r = retargetFor(action, phase);
      if (!r) {
        return false;
      }
      const copy = new PointerEvent(e.type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: e.clientX,
        clientY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        isPrimary: e.isPrimary,
        pressure: e.pressure,
        tiltX: e.tiltX,
        tiltY: e.tiltY,
        width: e.width,
        height: e.height,
        button: r.button,
        buttons: r.buttons,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      });
      (copy as any)[SELF] = true;
      e.stopImmediatePropagation();
      e.preventDefault();
      (e.target as EventTarget).dispatchEvent(copy);
      return true;
    };

    const onPointer = (ev: Event) => {
      const e = ev as PointerEvent;
      if ((e as any)[SELF]) {
        return;
      }
      const settings = appJotaiStore.get(penSettingsAtom);

      if (isPen(e)) {
        lastPenAt = performance.now();
      }

      // 1) palma / dedo mientras el lápiz está cerca
      if (
        onCanvas(e) &&
        shouldRejectTouch(e, settings, performance.now(), lastPenAt)
      ) {
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }

      // 2) botón del costado
      if (!onCanvas(e) || !isPen(e)) {
        return;
      }
      if (e.type === "pointerdown") {
        if (isBarrelPressed(e) && settings.barrel !== "contextMenu") {
          session = { id: e.pointerId, action: settings.barrel };
          suppressMenuUntil = performance.now() + 1500;
          redispatch(e, "down", settings.barrel);
        }
      } else if (session && session.id === e.pointerId) {
        if (e.type === "pointermove") {
          redispatch(e, "move", session.action);
        } else if (e.type === "pointerup") {
          redispatch(e, "up", session.action);
          session = null;
        } else if (e.type === "pointercancel") {
          session = null;
        }
      }
    };

    // el barril también dispara "contextmenu": se tapa si su acción no es abrir el menú
    const onContextMenu = (e: Event) => {
      const settings = appJotaiStore.get(penSettingsAtom);
      const pe = e as PointerEvent;
      if (
        settings.barrel !== "contextMenu" &&
        onCanvas(e) &&
        (pe.pointerType === "pen" ||
          session ||
          performance.now() < suppressMenuUntil)
      ) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };

    const types = [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
    ] as const;
    types.forEach((t) => window.addEventListener(t, onPointer, true));
    window.addEventListener("contextmenu", onContextMenu, true);
    return () => {
      types.forEach((t) => window.removeEventListener(t, onPointer, true));
      window.removeEventListener("contextmenu", onContextMenu, true);
    };
  }, []);

  return null;
};
