import { CaptureUpdateAction, useExcalidrawAPI } from "@excalidraw/excalidraw";
import { applyDarkModeFilter } from "@excalidraw/common";
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";
import {
  MAX_SHEET_SPACING,
  MIN_SHEET_SPACING,
  normalizeSheetBackground,
  resolvePatternStyle,
} from "@excalidraw/excalidraw/scene/sheetBackground";
import { useState } from "react";

import type {
  SheetBackground,
  SheetBackgroundType,
} from "@excalidraw/excalidraw/scene/sheetBackground";

import { useAtom } from "../../app-jotai";

import { backgroundDialogOpenAtom } from "./backgroundState";
import {
  FACTORY_SHEET_STYLE,
  clearDefaultSheetStyle,
  saveDefaultSheetStyle,
} from "./defaults";

import "./background.scss";

const TYPES: { type: SheetBackgroundType; label: string }[] = [
  { type: "plain", label: "Liso" },
  { type: "grid", label: "Cuadriculado" },
  { type: "lines", label: "Rayado" },
  { type: "dots", label: "Punteado" },
];

const SWATCHES = [
  "#ffffff",
  "#fff9db",
  "#e7f5ff",
  "#ebfbee",
  "#f8f0fc",
  "#fff0e6",
  "#f1f3f5",
  "#1e1e1e",
];

const HEX6 = /^#[0-9a-f]{6}$/i;

/** Miniatura del dibujo de fondo (mismos colores y proporciones que en la hoja). */
const PatternPreview = ({
  background,
  color,
  dark,
}: {
  background: SheetBackground;
  color: string;
  dark: boolean;
}) => {
  const style = resolvePatternStyle(color, background.lineColor, dark);
  const s = Math.max(6, Math.min(14, background.spacing / 2.4));
  const id = `tuw-prev-${background.type}`;
  return (
    <svg viewBox="0 0 84 56" width="84" height="56" aria-hidden="true">
      <rect width="84" height="56" fill={applyDarkModeFilter(color, dark)} />
      {background.type !== "plain" && (
        <>
          <defs>
            <pattern id={id} width={s} height={s} patternUnits="userSpaceOnUse">
              {background.type === "dots" ? (
                <circle
                  cx={s / 2}
                  cy={s / 2}
                  r={0.9}
                  fill={style.color}
                  fillOpacity={style.alpha}
                />
              ) : (
                <path
                  d={
                    background.type === "grid"
                      ? `M0 .25H${s}M.25 0V${s}`
                      : `M0 .25H${s}`
                  }
                  stroke={style.color}
                  strokeOpacity={style.alpha}
                  strokeWidth={0.6}
                  fill="none"
                />
              )}
            </pattern>
          </defs>
          <rect width="84" height="56" fill={`url(#${id})`} />
        </>
      )}
    </svg>
  );
};

export const SheetBackgroundDialog = () => {
  const [isOpen, setIsOpen] = useAtom(backgroundDialogOpenAtom);
  const api = useExcalidrawAPI();
  const appState = useUIAppState();
  const [saved, setSaved] = useState<string | null>(null);

  if (!isOpen || !api) {
    return null;
  }

  const bg = normalizeSheetBackground(appState.tuwBackground);
  const color = HEX6.test(appState.viewBackgroundColor)
    ? appState.viewBackgroundColor
    : "#ffffff";
  const dark = appState.theme === "dark";

  const apply = (patch: Partial<SheetBackground>) => {
    setSaved(null);
    // se parte del estado ACTUAL del editor (no del último dibujo del diálogo): dos cambios
    // seguidos (p. ej. separación y luego color) no se pisan entre sí
    const current = normalizeSheetBackground(api.getAppState().tuwBackground);
    api.updateScene({
      appState: {
        tuwBackground: normalizeSheetBackground({ ...current, ...patch }),
      } as any,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  };

  const setColor = (value: string) => {
    setSaved(null);
    api.updateScene({
      appState: { viewBackgroundColor: value } as any,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  return (
    <Dialog
      size="small"
      title="Fondo de la hoja"
      onCloseRequest={() => setIsOpen(false)}
    >
      <div className="tuw-bg" data-testid="tuw-bg-dialog">
        <div
          className="tuw-bg__types"
          role="radiogroup"
          aria-label="Tipo de fondo"
        >
          {TYPES.map((t) => (
            <button
              key={t.type}
              role="radio"
              aria-checked={bg.type === t.type}
              className={`tuw-bg__card${bg.type === t.type ? " is-on" : ""}`}
              data-testid={`tuw-bg-${t.type}`}
              onClick={() => apply({ type: t.type })}
            >
              <PatternPreview
                background={{ ...bg, type: t.type }}
                color={color}
                dark={dark}
              />
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="tuw-bg__section">
          <div className="tuw-bg__label">Color de fondo</div>
          <div className="tuw-bg__swatches">
            {SWATCHES.map((c) => (
              <button
                key={c}
                className={`tuw-bg__swatch${
                  c.toLowerCase() === color.toLowerCase() ? " is-on" : ""
                }`}
                style={{ background: c }}
                title={c}
                aria-label={`Fondo ${c}`}
                onClick={() => setColor(c)}
              />
            ))}
            <label className="tuw-bg__custom" title="Elegir otro color">
              <input
                type="color"
                value={color}
                aria-label="Color de fondo personalizado"
                onChange={(e) => setColor(e.target.value)}
              />
              <span>Otro…</span>
            </label>
          </div>
        </div>

        {bg.type !== "plain" && (
          <>
            <div className="tuw-bg__section">
              <div className="tuw-bg__label">Color de las líneas</div>
              <div className="tuw-bg__row">
                <label>
                  <input
                    type="checkbox"
                    checked={bg.lineColor === null}
                    onChange={(e) =>
                      apply({ lineColor: e.target.checked ? null : "#868e96" })
                    }
                  />{" "}
                  Automático
                </label>
                {bg.lineColor !== null && (
                  <input
                    type="color"
                    value={HEX6.test(bg.lineColor) ? bg.lineColor : "#868e96"}
                    aria-label="Color de las líneas"
                    onChange={(e) => apply({ lineColor: e.target.value })}
                  />
                )}
              </div>
            </div>

            <div className="tuw-bg__section">
              <div className="tuw-bg__label">
                Separación <span className="tuw-bg__value">{bg.spacing}</span>
              </div>
              <input
                className="tuw-bg__range"
                type="range"
                min={MIN_SHEET_SPACING}
                max={MAX_SHEET_SPACING}
                step={2}
                value={bg.spacing}
                aria-label="Separación"
                onChange={(e) => apply({ spacing: Number(e.target.value) })}
              />
            </div>
          </>
        )}

        <div className="tuw-bg__defaults">
          <button
            className="tuw-bg__btn"
            onClick={() => {
              const ok = saveDefaultSheetStyle({
                viewBackgroundColor: color,
                tuwBackground: bg,
              });
              setSaved(
                ok
                  ? "Listo: las hojas nuevas usarán este fondo."
                  : "No se pudo guardar.",
              );
            }}
          >
            Usar para las hojas nuevas
          </button>
          <button
            className="tuw-bg__btn is-secondary"
            onClick={() => {
              clearDefaultSheetStyle();
              setSaved(
                `Las hojas nuevas vuelven a ser lisas y blancas (${FACTORY_SHEET_STYLE.viewBackgroundColor}).`,
              );
            }}
          >
            Restablecer
          </button>
        </div>
        {saved && (
          <div className="tuw-bg__saved" role="status">
            {saved}
          </div>
        )}
      </div>
    </Dialog>
  );
};
