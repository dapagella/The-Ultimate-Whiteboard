import { CaptureUpdateAction, useExcalidrawAPI } from "@excalidraw/excalidraw";
import { useEffect, useState } from "react";

import { DEFAULT_AXIS_STYLE, createAxisElements } from "./elements";
import { axisTips, paramsFromDrag, rolesOf } from "./geometry";

import "./axes.scss";

import type { AxisDim, AxisParams } from "./geometry";

type Drag = { x0: number; y0: number; x1: number; y1: number };

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Botones "Eje 2D" / "Eje 3D": un clic en el lienzo coloca el origen (tamaño por defecto) y
 * arrastrar define el tamaño. Escape cancela.
 */
export const AxesBar = () => {
  const api = useExcalidrawAPI();
  const [mode, setMode] = useState<AxisDim | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  useEffect(() => {
    if (!mode) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMode(null);
        setDrag(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  if (!api) {
    return null;
  }

  const create = (dim: AxisDim, d: Drag) => {
    const s = api.getAppState();
    const zoom = s.zoom.value;
    // de píxeles de pantalla a unidades de la hoja
    const origin = {
      x: (d.x0 - s.offsetLeft) / zoom - s.scrollX,
      y: (d.y0 - s.offsetTop) / zoom - s.scrollY,
    };
    const params: AxisParams = paramsFromDrag(
      dim,
      (d.x1 - d.x0) / zoom,
      (d.y1 - d.y0) / zoom,
    );
    const { elements, groupId } = createAxisElements(dim, origin, params, {
      ...DEFAULT_AXIS_STYLE,
      // el color de un preset de trazo (p. ej. el amarillo del resaltador) no se usa para los ejes
      strokeColor:
        !s.tuwStroke?.preset && HEX.test(s.currentItemStrokeColor)
          ? s.currentItemStrokeColor
          : DEFAULT_AXIS_STYLE.strokeColor,
      opacity: 100, // los ejes siempre opacos (aunque esté activo el resaltador)
    });
    api.updateScene({
      elements: [...api.getSceneElementsIncludingDeleted(), ...elements],
      appState: {
        selectedElementIds: Object.fromEntries(
          elements.map((e) => [e.id, true]),
        ),
        selectedGroupIds: { [groupId]: true },
      } as any,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  // vista previa del eje mientras se arrastra (en píxeles de pantalla)
  const preview = () => {
    if (!mode || !drag) {
      return null;
    }
    const p = paramsFromDrag(mode, drag.x1 - drag.x0, drag.y1 - drag.y0);
    const tips = axisTips(mode, p);
    return (
      <svg className="tuw-axes__preview" aria-hidden="true">
        <defs>
          <marker
            id="tuw-axes-head"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M0 0L10 5L0 10z" fill="#6965db" />
          </marker>
        </defs>
        {rolesOf(mode).map((role) => {
          const t = tips[role]!;
          return (
            <line
              key={role}
              x1={drag.x0}
              y1={drag.y0}
              x2={drag.x0 + t.x}
              y2={drag.y0 + t.y}
              stroke="#6965db"
              strokeWidth={2}
              markerEnd="url(#tuw-axes-head)"
            />
          );
        })}
      </svg>
    );
  };

  return (
    <>
      <div
        className="tuw-axes"
        data-testid="tuw-axes"
        role="toolbar"
        aria-label="Ejes"
      >
        <span className="tuw-axes__title">Ejes</span>
        {([2, 3] as const).map((dim) => (
          <button
            key={dim}
            className={`tuw-axes__btn${mode === dim ? " is-on" : ""}`}
            data-testid={`tuw-axes-${dim}d`}
            aria-pressed={mode === dim}
            title={
              dim === 2
                ? "Eje 2D: clic para colocar, o arrastrá para elegir el tamaño"
                : "Eje 3D: clic para colocar, o arrastrá para elegir el tamaño"
            }
            onClick={() => {
              setDrag(null);
              setMode(mode === dim ? null : dim);
            }}
          >
            Eje {dim}D
          </button>
        ))}
      </div>

      {mode && (
        <div
          className="tuw-axes__overlay"
          data-testid="tuw-axes-overlay"
          onPointerDown={(e) => {
            e.preventDefault();
            try {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            } catch {
              // sin captura (p. ej. eventos sintéticos): el arrastre igual funciona sobre la capa
            }
            setDrag({
              x0: e.clientX,
              y0: e.clientY,
              x1: e.clientX,
              y1: e.clientY,
            });
          }}
          onPointerMove={(e) => {
            if (drag) {
              setDrag({ ...drag, x1: e.clientX, y1: e.clientY });
            }
          }}
          onPointerUp={(e) => {
            if (drag) {
              create(mode, { ...drag, x1: e.clientX, y1: e.clientY });
            }
            setDrag(null);
            setMode(null);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setMode(null);
            setDrag(null);
          }}
        >
          <div className="tuw-axes__hint">
            Clic para colocar el eje {mode}D, o arrastrá para elegir el tamaño ·
            Esc cancela
          </div>
          {preview()}
        </div>
      )}
    </>
  );
};
