import {
  findAssignment,
  getHostToolbarItem,
  getToolbarAssignments,
  isNativeToolId,
  useExcalidrawAPI,
} from "@excalidraw/excalidraw";
import { useEffect } from "react";

const ON_CANVAS = "canvas.interactive";

/**
 * Botones del lápiz/mouse asignados a funciones de la barra (clic derecho sobre el botón → «Asignar un
 * botón…»). Si la función es una herramienta (p. ej. la manito) se activa mientras el botón está apretado
 * y al soltarlo se vuelve a la herramienta anterior; el editor hace el resto como siempre.
 * Si es otra cosa (eje, fórmula…), se ejecuta una vez al apretar.
 */
export const ButtonAssignGuard = () => {
  const api = useExcalidrawAPI();

  useEffect(() => {
    if (!api) {
      return;
    }
    let prevTool: string | null = null;
    let firedFor: number | null = null; // pointerId de una acción de un solo toque ya ejecutada

    const onCanvas = (e: Event) =>
      !!(e.target as HTMLElement | null)?.closest?.(ON_CANVAS);

    const hasContact = (e: PointerEvent) =>
      e.pointerType === "pen" ? (e.buttons & 1) !== 0 || e.pressure > 0 : true;

    const restore = () => {
      if (prevTool !== null) {
        const t = prevTool;
        prevTool = null;
        // después de que el editor procese el pointerup
        window.setTimeout(() => api.setActiveTool({ type: t as any }), 0);
      }
    };

    const onPointer = (ev: Event) => {
      const e = ev as PointerEvent;
      const hit = findAssignment(getToolbarAssignments(), e);

      if (prevTool !== null) {
        // soltó el botón y no hay punta apoyada (o se canceló): vuelve la herramienta anterior
        if (e.type === "pointercancel" || (!hit && !hasContact(e))) {
          restore();
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
        const current = api.getAppState().activeTool.type;
        if (current !== hit.itemId) {
          prevTool = current;
          api.setActiveTool({ type: hit.itemId });
        }
        return;
      }

      // acción de un solo toque (ejes, fórmula…)
      e.stopImmediatePropagation();
      e.preventDefault();
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
        (prevTool !== null ||
          (pe.pointerType === "pen" &&
            Object.keys(getToolbarAssignments()).includes("pen:2")))
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
      prevTool = null;
    };
  }, [api]);

  return null;
};
