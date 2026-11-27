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

type Session = {
  id: number;
  prevTool: string;
  /** false mientras el editor termina de cambiar de herramienta. */
  started: boolean;
  last: PointerEvent;
};

/**
 * Botones del lápiz/mouse asignados a funciones de la barra (clic derecho sobre el botón → «Asignar un
 * botón…»). Si la función es una herramienta (p. ej. la manito), se usa mientras el botón está apretado
 * y al soltar se vuelve a la anterior; si es otra cosa (eje, fórmula…), se ejecuta al apretar.
 */
export const ButtonAssignGuard = () => {
  const api = useExcalidrawAPI();

  useEffect(() => {
    if (!api) {
      return;
    }
    let session: Session | null = null;
    let firedFor: number | null = null; // pointerId de una acción de un solo toque ya ejecutada

    const onCanvas = (e: Event) =>
      !!(e.target as HTMLElement | null)?.closest?.(ON_CANVAS);

    /** Evento "disfrazado": el editor lo ve como un toque normal (botón principal). */
    const synth = (
      e: PointerEvent,
      type: string,
      button: number,
      buttons: number,
    ) => {
      const c = new PointerEvent(type, {
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
        pressure: buttons ? Math.max(e.pressure, 0.5) : 0,
        tiltX: e.tiltX,
        tiltY: e.tiltY,
        button,
        buttons,
      });
      (c as any)[SELF] = true;
      return c;
    };

    const suppress = (e: Event) => {
      e.stopImmediatePropagation();
      e.preventDefault();
    };

    const hasContact = (e: PointerEvent) =>
      e.pointerType === "pen" ? (e.buttons & 1) !== 0 || e.pressure > 0 : true;

    const finish = (e: PointerEvent) => {
      const s = session!;
      session = null;
      if (s.started) {
        (e.target as EventTarget).dispatchEvent(synth(e, "pointerup", 0, 0));
      }
      api.setActiveTool({ type: s.prevTool as any });
    };

    const onPointer = (ev: Event) => {
      const e = ev as PointerEvent;
      if ((e as any)[SELF]) {
        return;
      }

      if (session) {
        if (e.pointerId !== session.id) {
          return;
        }
        suppress(e);
        const lifted =
          e.type === "pointerup" ||
          e.type === "pointercancel" ||
          (e.pointerType === "pen" && !hasContact(e)) ||
          (e.pointerType !== "pen" && e.buttons === 0);
        if (lifted) {
          finish(e);
        } else if (session.started) {
          (e.target as EventTarget).dispatchEvent(
            synth(e, "pointermove", -1, 1),
          );
        } else {
          session.last = e;
        }
        return;
      }

      if (e.type === "pointerup" || e.type === "pointercancel") {
        if (firedFor === e.pointerId) {
          firedFor = null;
        }
        return;
      }
      if (e.type !== "pointerdown" && e.type !== "pointermove") {
        return;
      }
      const hit = findAssignment(getToolbarAssignments(), e);
      if (!hit || !hasContact(e) || !onCanvas(e)) {
        return;
      }

      suppress(e);
      if (isNativeToolId(hit.itemId)) {
        const prev = api.getAppState().activeTool.type;
        api.setActiveTool({ type: hit.itemId });
        const s: Session = {
          id: e.pointerId,
          prevTool: prev,
          started: false,
          last: e,
        };
        session = s;
        // el editor cambia de herramienta de forma asíncrona: se empieza recién cuando ya cambió
        window.setTimeout(() => {
          if (session === s) {
            s.started = true;
            (s.last.target as EventTarget).dispatchEvent(
              synth(s.last, "pointerdown", 0, 1),
            );
          }
        }, 0);
        return;
      }

      // acción de un solo toque (ejes, fórmula…)
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
        (session ||
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
      session = null;
    };
  }, [api]);

  return null;
};
