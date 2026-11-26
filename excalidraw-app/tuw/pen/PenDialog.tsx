import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";
import { useState } from "react";

import { useAtom } from "../../app-jotai";

import { BARREL_ACTIONS, describePointer } from "./penInput";
import {
  penDialogOpenAtom,
  penSettingsAtom,
  savePenSettings,
} from "./penState";

import "./pen.scss";

import type { BarrelAction } from "./penInput";

export const PenDialog = () => {
  const [open, setOpen] = useAtom(penDialogOpenAtom);
  const [settings] = useAtom(penSettingsAtom);
  const api = useExcalidrawAPI();
  const appState = useUIAppState();
  const [log, setLog] = useState<string[]>([]);

  // modo "detectar botón": muestra lo que llega del lápiz/tableta sobre la zona de prueba
  const onDetect = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.type === "pointermove") {
      return;
    }
    if (e.type === "pointermove" && e.buttons === 0) {
      return;
    }
    const line = describePointer(e);
    setLog((l) => (l[0] === line ? l : [line, ...l].slice(0, 8)));
  };

  if (!open || !api) {
    return null;
  }

  return (
    <Dialog
      size="small"
      title="Lápiz y tableta"
      onCloseRequest={() => setOpen(false)}
    >
      <div className="tuw-pen" data-testid="tuw-pen-dialog">
        <label className="tuw-pen__row">
          <input
            type="checkbox"
            data-testid="tuw-pen-only"
            checked={appState.penMode}
            onChange={(e) =>
              api.updateScene({
                appState: {
                  penMode: e.target.checked,
                  penDetected: true,
                } as any,
              })
            }
          />
          <span>
            <b>Solo el lápiz dibuja</b>
            <small>
              El dedo solo mueve y hace zoom. Se activa solo la primera vez que
              la app detecta un lápiz.
            </small>
          </span>
        </label>

        <label className="tuw-pen__row">
          <input
            type="checkbox"
            data-testid="tuw-pen-palm"
            checked={settings.rejectPalm}
            onChange={(e) =>
              savePenSettings({ ...settings, rejectPalm: e.target.checked })
            }
          />
          <span>
            <b>Rechazar la palma</b>
            <small>
              Mientras el lápiz está cerca de la pantalla se ignoran el dedo y
              la palma apoyada.
            </small>
          </span>
        </label>

        <label className="tuw-pen__row">
          <input
            type="checkbox"
            data-testid="tuw-pen-straight"
            checked={settings.straightHold}
            onChange={(e) =>
              savePenSettings({ ...settings, straightHold: e.target.checked })
            }
          />
          <span>
            <b>Línea recta al mantener quieto</b>
            <small>
              Dibujando con el lápiz, si lo dejás quieto un momento el trazo se
              vuelve una línea recta que sigue al lápiz hasta que lo levantás.
            </small>
          </span>
        </label>

        <div className="tuw-pen__section">
          <div className="tuw-pen__label">Botón del costado del lápiz</div>
          {BARREL_ACTIONS.map((a) => (
            <label key={a.value} className="tuw-pen__radio">
              <input
                type="radio"
                name="tuw-pen-barrel"
                data-testid={`tuw-pen-barrel-${a.value}`}
                checked={settings.barrel === a.value}
                onChange={() =>
                  savePenSettings({
                    ...settings,
                    barrel: a.value as BarrelAction,
                  })
                }
              />{" "}
              {a.label}
            </label>
          ))}
          <small>
            La punta trasera (goma) del lápiz borra siempre, si tu tableta la
            tiene.
          </small>
        </div>

        <div className="tuw-pen__section">
          <div className="tuw-pen__label">Detectar botón</div>
          <div
            className="tuw-pen__detect"
            data-testid="tuw-pen-detect"
            tabIndex={0}
            onPointerDown={onDetect}
            onPointerMove={onDetect}
            onPointerUp={onDetect}
            onContextMenu={(e) => e.preventDefault()}
          >
            {log.length === 0 ? (
              <span>
                Tocá esta zona con el lápiz y apretá sus botones: acá se ve qué
                manda tu tableta.
              </span>
            ) : (
              log.map((l, i) => <div key={i}>{l}</div>)
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
};
