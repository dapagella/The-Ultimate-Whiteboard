import {
  findAssignment,
  getHostToolbarItem,
  getToolbarAssignments,
  isNativeToolId,
  useExcalidrawAPI,
} from "@excalidraw/excalidraw";
import { useEffect } from "react";

const ON_CANVAS = "canvas.interactive";
const SELF = Symbol("tuw-assigned-button");

type Held = { prevTool: string };

/**
 * Botones del lápiz/mouse asignados a funciones de la barra (clic derecho sobre el botón → «Asignar un
 * botón…»). Si la función es una herramienta (p. ej. la manito) se activa al apretar el botón y funciona
 * exactamente como siempre; al soltarlo se vuelve a la herramienta anterior. Si es otra cosa (eje,
 * fórmula…), se ejecuta una vez al apretar.
 */
export const ButtonAssignGuard = () => {
  const api = useExcalidrawAPI();

  useEffect(() => {
    if (!api) {
      return;
    }
    let held: Held | null = null;
    let tipDown = false; // el editor ya recibió el toque de la punta
    let firedFor: number | null = null; // pointerId de una acción de un solo toque ya ejecutada

    const onCanvas = (e: Event) =>
      !!(e.target as HTMLElement | null)?.closest?.(ON_CANVAS);

    const suppress = (e: Event) => {
      e.stopImmediatePropagation();
      e.preventDefault();
    };

    const hasContact = (e: PointerEvent) =>
      e.pointerType === "pen" ? (e.buttons & 1) !== 0 || e.pressure > 0 : true;

    const release = () => {
      if (held) {
        const prev = held.prevTool;
        held = null;
        // después de que el editor procese el pointerup
        window.setTimeout(() => api.setActiveTool({ type: prev as any }), 0);
      }
    };

    /** Un único pointerdown "limpio" (botón principal) para que el editor arranque con la nueva herramienta. */
    const replayDown = (e: PointerEvent) => {
      const c = new PointerEvent("pointerdown", {
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
        pressure: Math.max(e.pressure, 0.5),
        tiltX: e.tiltX,
        tiltY: e.tiltY,
        button: 0,
        buttons: 1,
      });
      (c as any)[SELF] = true;
      (e.target as EventTarget).dispatchEvent(c);
    };

    const onPointer = (ev: Event) => {
      const e = ev as PointerEvent;
      if ((e as any)[SELF]) {
        return;
      }
      const hit = findAssignment(getToolbarAssignments(), e);

      if (held) {
        // soltó el botón y no hay punta apoyada (o se canceló): vuelve la herramienta anterior
        if (e.type === "pointercancel" || (!hit && !hasContact(e))) {
          tipDown = false;
          release();
          return;
        }
        if (!hasContact(e)) {
          tipDown = false;
        } else if (!tipDown) {
          // la punta se apoyó con el botón ya apretado: el navegador no manda un "pointerdown"
          tipDown = true;
          if (e.type !== "pointerdown") {
            suppress(e);
            replayDown(e);
          }
        }
        return;
      }

      if (e.type === "pointerup" || e.type === "pointercancel") {
        if (firedFor === e.pointerId) {
          firedFor = null;
        }
        return;
      }
      if (
        !hit ||
        (e.type !== "pointerdown" && e.type !== "pointermove") ||
        !onCanvas(e)
      ) {
        return;
      }

      if (isNativeToolId(hit.itemId)) {
        const prev = api.getAppState().activeTool.type;
        if (prev === hit.itemId) {
          return;
        }
        held = { prevTool: prev };
        tipDown = e.type === "pointerdown" && hasContact(e);
        api.setActiveTool({ type: hit.itemId });
        if (e.type === "pointerdown") {
          // el editor todavía no cambió de herramienta: se repite el toque ya limpio
          suppress(e);
          if (hasContact(e)) {
            window.setTimeout(() => replayDown(e), 0);
          }
        }
        return;
      }

      // acción de un solo toque (ejes, fórmula…)
      suppress(e);
      if (firedFor !== e.pointerId) {
        firedFor = e.pointerId;
        getHostToolbarItem(hit.itemId)?.onSelect();
      }
    };

    // el botón del costado también dispara "contextmenu": se tapa si está asignado
    const onContextMenu = (e: Event) => {
      const pe = e as PointerEvent;
      if (
        onCanvas(e) &&
        (held ||
          (pe.pointerType === "pen" &&
            Object.keys(getToolbarAssignments()).includes("pen:2")))
      ) {
        suppress(e);
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
      held = null;
    };
  }, [api]);

  return null;
};
