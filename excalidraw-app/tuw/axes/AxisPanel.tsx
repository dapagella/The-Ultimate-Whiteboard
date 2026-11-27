import { CaptureUpdateAction, useExcalidrawAPI } from "@excalidraw/excalidraw";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";
import { useEffect, useState } from "react";

import { axisIdFromSelection, readAxis, regenerateAxis } from "./elements";
import { DEFAULT_Z_ANGLE, MAX_AXIS_LENGTH, MIN_AXIS_LENGTH } from "./geometry";

import "./axes.scss";

import type { AxisParams } from "./geometry";

/** Número que se confirma al salir del campo o con Enter (para poder escribir "150" sin saltos). */
const NumberField = ({
  label,
  value,
  min,
  max,
  suffix,
  onCommit,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onCommit: (n: number) => void;
  testId?: string;
}) => {
  const shown = String(Math.round(value * 10) / 10);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) {
      const n = Number(draft.replace(",", "."));
      if (Number.isFinite(n)) {
        onCommit(Math.min(max, Math.max(min, n)));
      }
    }
    setDraft(null);
  };
  return (
    <label className="tuw-axis-panel__field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        data-testid={testId}
        value={draft ?? shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            commit();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setDraft(null);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {suffix && <em>{suffix}</em>}
    </label>
  );
};

/** Panel que aparece al seleccionar un eje: ángulo Z y largos. Las etiquetas se editan con doble clic. */
export const AxisPanel = () => {
  const api = useExcalidrawAPI();
  const appState = useUIAppState();
  const [, setTick] = useState(0);

  // se vuelve a leer cuando cambian los elementos (p. ej. si el usuario escala el eje)
  useEffect(() => {
    if (!api) {
      return;
    }
    const off = api.onChange(() => setTick((t) => t + 1));
    return () => off?.();
  }, [api]);

  if (!api) {
    return null;
  }
  const elements = api.getSceneElementsIncludingDeleted();
  const axisId = axisIdFromSelection(elements, appState.selectedElementIds);
  const info = axisId ? readAxis(elements, axisId) : null;
  if (!axisId || !info) {
    return null;
  }

  const apply = (patch: Partial<AxisParams>) => {
    api.updateScene({
      elements: regenerateAxis(
        api.getSceneElementsIncludingDeleted(),
        axisId,
        // en 3D la diagonal siempre queda a 225° (también en ejes viejos al editarlos)
        info.dim === 3 ? { ...patch, angleZDeg: DEFAULT_Z_ANGLE } : patch,
      ),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setTick((t) => t + 1);
  };

  const p = info.params;
  return (
    <div className="tuw-axis-panel" data-testid="tuw-axis-panel">
      <div className="tuw-axis-panel__title">Eje {info.dim}D</div>
      <NumberField
        label="Largo X"
        value={p.lengthX}
        min={MIN_AXIS_LENGTH}
        max={MAX_AXIS_LENGTH}
        onCommit={(n) => apply({ lengthX: n })}
        testId="tuw-axis-lx"
      />
      <NumberField
        label="Largo Y"
        value={p.lengthY}
        min={MIN_AXIS_LENGTH}
        max={MAX_AXIS_LENGTH}
        onCommit={(n) => apply({ lengthY: n })}
        testId="tuw-axis-ly"
      />
      {info.dim === 3 && (
        <>
          <NumberField
            label="Largo Z"
            value={p.lengthZ!}
            min={MIN_AXIS_LENGTH}
            max={MAX_AXIS_LENGTH}
            onCommit={(n) => apply({ lengthZ: n })}
            testId="tuw-axis-lz"
          />
          <div className="tuw-axis-panel__hint">
            La diagonal va fija a {DEFAULT_Z_ANGLE}°.
          </div>
        </>
      )}
      <div className="tuw-axis-panel__hint">
        Las letras de cada eje las escribís vos con la herramienta de texto (T).
      </div>
    </div>
  );
};
