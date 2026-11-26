import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { useEffect, useRef, useState } from "react";

import { useAtom } from "../../app-jotai";

import { insertLatex, updateLatex } from "./insertImage";
import {
  DEFAULT_LATEX,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  readLatexData,
} from "./latex/latexSvg";
import { renderLatex } from "./latex/renderLatex";
import { latexDialogAtom } from "./contentState";

import "./content.scss";

import type { LatexData } from "./latex/latexSvg";
import type { LatexRender } from "./latex/renderLatex";

const COLORS = [
  "#1e1e1e",
  "#e03131",
  "#2f9e44",
  "#1971c2",
  "#f08c00",
  "#9c36b5",
];

const EXAMPLES: { label: string; tex: string }[] = [
  { label: "Integral", tex: "\\int_0^1 x^2\\,dx" },
  { label: "Fracción", tex: "\\frac{a+b}{c}" },
  { label: "Raíz", tex: "\\sqrt{x^2+y^2}" },
  { label: "Suma", tex: "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}" },
  { label: "Límite", tex: "\\lim_{x\\to 0}\\frac{\\sin x}{x}=1" },
  { label: "Matriz", tex: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}" },
];

export const LatexDialog = () => {
  const [state, setState] = useAtom(latexDialogAtom);
  const api = useExcalidrawAPI();
  const [data, setData] = useState<LatexData>(DEFAULT_LATEX);
  const [render, setRender] = useState<LatexRender | null>(null);
  const [busy, setBusy] = useState(false);
  const lastGood = useRef<Extract<LatexRender, { ok: true }> | null>(null);

  // al abrir: valores iniciales (los de la fórmula que se edita, o los de la última usada)
  const stateKey = state ? (state.mode === "edit" ? state.id : "new") : null;
  useEffect(() => {
    if (!state || !api) {
      return;
    }
    lastGood.current = null;
    setRender(null);
    if (state.mode === "edit") {
      const el = api
        .getSceneElementsIncludingDeleted()
        .find((e) => e.id === state.id);
      setData(readLatexData(el?.customData) ?? DEFAULT_LATEX);
    } else {
      setData(DEFAULT_LATEX);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey, api]);

  // vista previa en vivo (con una pequeña espera para no recalcular en cada tecla)
  useEffect(() => {
    if (!state) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const r = await renderLatex(data).catch(
        (e): LatexRender => ({
          ok: false,
          error: String(e?.message ?? e),
        }),
      );
      if (!cancelled) {
        if (r.ok) {
          lastGood.current = r;
        }
        setRender(r);
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [state, data]);

  if (!state || !api) {
    return null;
  }

  const close = () => setState(null);
  const patch = (p: Partial<LatexData>) => setData((d) => ({ ...d, ...p }));
  const good = render?.ok ? render : null;

  const accept = async () => {
    if (!good) {
      return;
    }
    setBusy(true);
    try {
      if (state.mode === "edit") {
        await updateLatex(api, state.id, data, good);
      } else {
        await insertLatex(api, data, good);
      }
      close();
    } finally {
      setBusy(false);
    }
  };

  const shown = good ?? lastGood.current;

  return (
    <Dialog
      size="regular"
      title={state.mode === "edit" ? "Editar fórmula" : "Insertar fórmula"}
      onCloseRequest={close}
    >
      <div className="tuw-content tuw-latex" data-testid="tuw-latex-dialog">
        <label className="tuw-content__label" htmlFor="tuw-latex-input">
          Fórmula en LaTeX
        </label>
        <textarea
          id="tuw-latex-input"
          data-testid="tuw-latex-input"
          className="tuw-content__input tuw-latex__input"
          rows={3}
          autoFocus
          spellCheck={false}
          value={data.source}
          onChange={(e) => patch({ source: e.target.value })}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              void accept();
            }
          }}
        />

        <div className="tuw-latex__examples">
          {EXAMPLES.map((x) => (
            <button
              key={x.label}
              type="button"
              className="tuw-content__chip"
              onClick={() => patch({ source: x.tex })}
            >
              {x.label}
            </button>
          ))}
        </div>

        <div className="tuw-latex__options">
          <label>
            Tamaño{" "}
            <input
              type="range"
              min={MIN_FONT_SIZE}
              max={MAX_FONT_SIZE}
              value={data.fontSize}
              data-testid="tuw-latex-size"
              onChange={(e) => patch({ fontSize: Number(e.target.value) })}
            />{" "}
            <span>{data.fontSize}</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={data.displayMode}
              data-testid="tuw-latex-display"
              onChange={(e) => patch({ displayMode: e.target.checked })}
            />{" "}
            Formato destacado
          </label>
          <span className="tuw-latex__colors" role="group" aria-label="Color">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`tuw-latex__swatch${
                  c === data.color ? " is-on" : ""
                }`}
                style={{ background: c }}
                aria-label={`Color ${c}`}
                onClick={() => patch({ color: c })}
              />
            ))}
          </span>
        </div>

        <div
          className="tuw-latex__preview"
          data-testid="tuw-latex-preview"
          aria-live="polite"
        >
          {shown ? (
            <img
              src={shown.dataURL}
              alt="Vista previa de la fórmula"
              style={{ maxWidth: "100%", maxHeight: 220 }}
            />
          ) : (
            <span className="tuw-content__hint">Calculando…</span>
          )}
        </div>
        {render && !render.ok && (
          <div
            className="tuw-content__error"
            role="alert"
            data-testid="tuw-latex-error"
          >
            {render.error}
          </div>
        )}

        <div className="tuw-content__actions">
          <button type="button" className="tuw-content__btn" onClick={close}>
            Cancelar
          </button>
          <button
            type="button"
            className="tuw-content__btn tuw-content__btn--primary"
            data-testid="tuw-latex-accept"
            disabled={!good || busy}
            onClick={() => void accept()}
          >
            {state.mode === "edit" ? "Guardar cambios" : "Insertar"}
          </button>
        </div>
      </div>
    </Dialog>
  );
};
