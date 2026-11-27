import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";
import { useEffect, useState } from "react";

import { useAtom } from "../../app-jotai";
import { getTuw, isDesktop, unwrap } from "../workspace/desktopApi";
import { parseScene } from "../workspace/sceneFile";

import { DEFAULT_EXPORT_OPTIONS, buildExportContent } from "./exportSheet";
import { exportDialogAtom } from "./exportState";

import "./export.scss";

import type { ExportFormat, ExportOptions, SheetData } from "./exportSheet";

const FORMATS: { value: ExportFormat; label: string; hint: string }[] = [
  {
    value: "png",
    label: "Imagen PNG",
    hint: "Para compartir o pegar en un documento.",
  },
  {
    value: "svg",
    label: "Imagen SVG",
    hint: "Vectorial: se puede agrandar sin perder calidad.",
  },
  {
    value: "pdf",
    label: "Documento PDF",
    hint: "Una página con la hoja completa: para imprimir o enviar.",
  },
  {
    value: "json",
    label: "Hoja (.excalidraw)",
    hint: "Archivo completo con imágenes: se abre en esta app y en excalidraw.com.",
  },
];

const baseName = (p: string) =>
  p
    .split("/")
    .pop()!
    .replace(/\.excalidraw$/i, "");

export const ExportDialog = () => {
  const [state, setState] = useAtom(exportDialogAtom);
  const api = useExcalidrawAPI();
  const [opts, setOpts] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  const openDialog = useUIAppState().openDialog?.name;

  // Ctrl+Shift+E y los diálogos de exportar del editor llevan al diálogo propio
  useEffect(() => {
    if (
      api &&
      isDesktop() &&
      (openDialog === "imageExport" || openDialog === "jsonExport")
    ) {
      api.updateScene({ appState: { openDialog: null } as any });
      setState({ path: null });
    }
  }, [api, openDialog, setState]);

  if (!state || !api) {
    return null;
  }

  const close = () => {
    setState(null);
    setMessage(null);
  };

  const run = async () => {
    const tuw = getTuw();
    if (!tuw) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      let name: string;
      let sheet: SheetData;
      if (state.path === null) {
        const info = await unwrap(tuw.workspace.getInfo());
        name = info.lastSheet ? baseName(info.lastSheet) : "Hoja";
        sheet = {
          elements: api.getSceneElementsIncludingDeleted(),
          appState: api.getAppState(),
          files: api.getFiles(),
        };
      } else {
        name = baseName(state.path);
        const { content } = await unwrap(tuw.workspace.readSheet(state.path));
        const data = parseScene(content);
        sheet = {
          elements: data.elements ?? [],
          appState: data.appState ?? {},
          files: data.files ?? {},
        };
      }
      const content = await buildExportContent(sheet, opts);
      const res = await unwrap(
        tuw.saveExport({ format: opts.format, suggestedName: name, content }),
      );
      if (res.saved) {
        setMessage({ kind: "ok", text: `Guardado en: ${res.path}` });
      }
    } catch (e: any) {
      setMessage({
        kind: "error",
        text: e?.message || "No se pudo exportar la hoja.",
      });
    } finally {
      setBusy(false);
    }
  };

  const current = FORMATS.find((f) => f.value === opts.format)!;

  return (
    <Dialog size="small" title="Exportar hoja" onCloseRequest={close}>
      <div className="tuw-export" data-testid="tuw-export-dialog">
        <div
          className="tuw-export__formats"
          role="radiogroup"
          aria-label="Formato"
        >
          {FORMATS.map((f) => (
            <label key={f.value} className="tuw-export__radio">
              <input
                type="radio"
                name="tuw-export-format"
                data-testid={`tuw-export-${f.value}`}
                checked={opts.format === f.value}
                onChange={() => setOpts({ ...opts, format: f.value })}
              />{" "}
              {f.label}
            </label>
          ))}
        </div>
        <p className="tuw-export__hint">{current.hint}</p>

        {opts.format !== "json" && (
          <label className="tuw-export__check">
            <input
              type="checkbox"
              data-testid="tuw-export-bg"
              checked={opts.background}
              onChange={(e) =>
                setOpts({ ...opts, background: e.target.checked })
              }
            />{" "}
            Incluir el fondo de la hoja (color y cuadrícula/rayas)
          </label>
        )}
        {(opts.format === "png" || opts.format === "pdf") && (
          <label className="tuw-export__check">
            Resolución{" "}
            <select
              data-testid="tuw-export-scale"
              value={opts.scale}
              onChange={(e) =>
                setOpts({ ...opts, scale: Number(e.target.value) as 1 | 2 | 3 })
              }
            >
              <option value={1}>Normal (1×)</option>
              <option value={2}>Alta (2×)</option>
              <option value={3}>Muy alta (3×)</option>
            </select>
          </label>
        )}

        {message && (
          <div
            className={`tuw-export__msg is-${message.kind}`}
            role={message.kind === "error" ? "alert" : "status"}
            data-testid="tuw-export-msg"
          >
            {message.text}
          </div>
        )}

        <div className="tuw-export__actions">
          <button type="button" className="tuw-export__btn" onClick={close}>
            {message?.kind === "ok" ? "Cerrar" : "Cancelar"}
          </button>
          <button
            type="button"
            className="tuw-export__btn tuw-export__btn--primary"
            data-testid="tuw-export-go"
            disabled={busy}
            onClick={() => void run()}
          >
            {busy ? "Exportando…" : "Exportar…"}
          </button>
        </div>
      </div>
    </Dialog>
  );
};
