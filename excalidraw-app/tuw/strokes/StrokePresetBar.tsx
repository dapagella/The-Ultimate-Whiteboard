import { CaptureUpdateAction, useExcalidrawAPI } from "@excalidraw/excalidraw";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";
import { DEFAULT_TUW_STROKE } from "@excalidraw/excalidraw/scene/tuwStroke";
import { FREEDRAW_STROKE_WIDTH } from "@excalidraw/common";
import { useState } from "react";

import {
  MAX_CUSTOM_PRESETS,
  addCustomPreset,
  allPresets,
  loadCustomPresets,
  presetFromCurrent,
  presetToAppState,
  removeCustomPreset,
  saveCustomPresets,
} from "./presets";

import "./strokes.scss";

import type { StrokePreset } from "./presets";

/** Colores primarios fuertes, siempre a mano para el lápiz. */
export const PRIMARY_COLORS: readonly { name: string; color: string }[] = [
  { name: "Negro", color: "#000000" },
  { name: "Rojo", color: "#ff0000" },
  { name: "Azul", color: "#0000ff" },
  { name: "Verde", color: "#00c000" },
  { name: "Amarillo", color: "#ffe000" },
  { name: "Blanco", color: "#ffffff" },
];

/** Muestra cómo se verá el trazo del preset (grosor, opacidad y color). */
const Sample = ({ preset }: { preset: StrokePreset }) => (
  <svg width="40" height="20" viewBox="0 0 40 20" aria-hidden="true">
    <path
      d="M3 14 C 10 2, 16 18, 22 8 S 33 6, 37 10"
      fill="none"
      stroke={preset.color}
      strokeOpacity={preset.opacity / 100}
      strokeWidth={Math.max(1, Math.min(12, preset.strokeWidth * 2.2))}
      strokeLinecap="round"
      style={
        preset.blendMode === "multiply"
          ? { mixBlendMode: "multiply" }
          : undefined
      }
    />
  </svg>
);

export const StrokePresetBar = () => {
  const api = useExcalidrawAPI();
  const appState = useUIAppState();
  const [custom, setCustom] = useState<StrokePreset[]>(loadCustomPresets);
  const [naming, setNaming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!api || appState.activeTool.type !== "freedraw") {
    return null;
  }

  const active = appState.tuwStroke?.preset ?? null;
  const presets = allPresets(custom);

  const apply = (preset: StrokePreset) => {
    setMessage(null);
    api.updateScene({
      appState: presetToAppState(preset) as any,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  };

  const clear = () => {
    api.updateScene({
      appState: { tuwStroke: DEFAULT_TUW_STROKE } as any,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  };

  const setColor = (color: string) => {
    api.updateScene({
      appState: { currentItemStrokeColor: color } as any,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  };

  const saveCurrent = (name: string) => {
    setNaming(false);
    const state = api.getAppState();
    const preset = presetFromCurrent(name, {
      color: /^#[0-9a-f]{6}$/i.test(state.currentItemStrokeColor)
        ? state.currentItemStrokeColor
        : "#1e1e1e",
      opacity: state.currentItemOpacity,
      variability: state.currentItemStrokeVariability,
      strokeWidth:
        state.tuwStroke?.strokeWidth ??
        FREEDRAW_STROKE_WIDTH[state.currentItemStrokeWidthKey as "thin"],
      blendMode: state.tuwStroke?.blendMode ?? "normal",
    });
    if (!preset) {
      setMessage("Escribí un nombre para el preset.");
      return;
    }
    const next = addCustomPreset(custom, preset);
    if (!next) {
      setMessage(
        custom.length >= MAX_CUSTOM_PRESETS
          ? `Ya tenés ${MAX_CUSTOM_PRESETS} presets propios.`
          : "Ya existe un preset con ese nombre.",
      );
      return;
    }
    saveCustomPresets(next);
    setCustom(next);
    apply(preset);
  };

  return (
    <div
      className="tuw-strokes"
      data-testid="tuw-strokes"
      role="toolbar"
      aria-label="Tipo de trazo"
    >
      {presets.map((p) => (
        <div key={p.id} className="tuw-strokes__item">
          <button
            className={`tuw-strokes__btn${active === p.id ? " is-on" : ""}`}
            data-testid={`tuw-stroke-${p.id}`}
            title={`${p.name} · ${p.opacity}%${
              p.blendMode === "multiply" ? " · multiplicar" : ""
            }`}
            aria-pressed={active === p.id}
            onClick={() => apply(p)}
          >
            <Sample preset={p} />
            <span>{p.name}</span>
          </button>
          {!p.builtin && (
            <button
              className="tuw-strokes__del"
              aria-label={`Eliminar ${p.name}`}
              title="Eliminar este preset"
              onClick={() => {
                const next = removeCustomPreset(custom, p.id);
                saveCustomPresets(next);
                setCustom(next);
                if (active === p.id) {
                  clear();
                }
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}

      {naming ? (
        <input
          className="tuw-strokes__name"
          autoFocus
          maxLength={24}
          placeholder="Nombre…"
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              saveCurrent(e.currentTarget.value);
            } else if (e.key === "Escape") {
              setNaming(false);
            }
          }}
          onBlur={() => setNaming(false)}
        />
      ) : (
        <button
          className="tuw-strokes__btn tuw-strokes__add"
          title="Guardar el trazo actual como preset"
          onClick={() => setNaming(true)}
        >
          ＋<span>Guardar</span>
        </button>
      )}
      {active && (
        <button
          className="tuw-strokes__btn tuw-strokes__none"
          onClick={clear}
          title="Volver al trazo normal"
        >
          <span>Sin preset</span>
        </button>
      )}
      <div
        className="tuw-strokes__colors"
        role="group"
        aria-label="Colores primarios"
      >
        {PRIMARY_COLORS.map((c) => {
          const on = appState.currentItemStrokeColor.toLowerCase() === c.color;
          return (
            <button
              key={c.color}
              className={`tuw-strokes__color${on ? " is-on" : ""}`}
              data-testid={`tuw-color-${c.color.slice(1)}`}
              style={{ background: c.color }}
              title={c.name}
              aria-label={c.name}
              aria-pressed={on}
              onClick={() => setColor(c.color)}
            />
          );
        })}
      </div>
      {message && (
        <div className="tuw-strokes__msg" role="status">
          {message}
        </div>
      )}
    </div>
  );
};
