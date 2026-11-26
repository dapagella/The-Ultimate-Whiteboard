import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { useState } from "react";

import { useAtom } from "../../app-jotai";
import { getTuw, unwrap } from "../workspace/desktopApi";

import { imageUrlDialogOpenAtom } from "./contentState";
import { insertFetchedImage } from "./insertImage";

import "./content.scss";

export const ImageUrlDialog = () => {
  const [isOpen, setIsOpen] = useAtom(imageUrlDialogOpenAtom);
  const api = useExcalidrawAPI();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !api) {
    return null;
  }

  const close = () => {
    setIsOpen(false);
    setError(null);
    setBusy(false);
  };

  const submit = async () => {
    const tuw = getTuw();
    if (!tuw) {
      setError("Esta función solo está disponible en la app de escritorio.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fetched = await unwrap(tuw.fetchImage(url));
      await insertFetchedImage(api, fetched);
      setUrl("");
      close();
    } catch (e: any) {
      setError(e?.message || "No se pudo insertar la imagen.");
      setBusy(false);
    }
  };

  return (
    <Dialog
      size="small"
      title="Insertar imagen desde una dirección web"
      onCloseRequest={close}
    >
      <form
        className="tuw-content"
        data-testid="tuw-imageurl-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) {
            void submit();
          }
        }}
      >
        <label className="tuw-content__label" htmlFor="tuw-imageurl-input">
          Dirección de la imagen (https://…)
        </label>
        <input
          id="tuw-imageurl-input"
          data-testid="tuw-imageurl-input"
          className="tuw-content__input"
          type="url"
          autoFocus
          spellCheck={false}
          placeholder="https://ejemplo.com/foto.png"
          value={url}
          disabled={busy}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
        />
        <p className="tuw-content__hint">
          Se descarga una copia y queda guardada dentro de la hoja: si la página
          original desaparece, la imagen sigue ahí. Máximo 15 MB.
        </p>
        {error && (
          <div
            className="tuw-content__error"
            role="alert"
            data-testid="tuw-imageurl-error"
          >
            {error}
          </div>
        )}
        <div className="tuw-content__actions">
          <button
            type="button"
            className="tuw-content__btn"
            onClick={close}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="tuw-content__btn tuw-content__btn--primary"
            data-testid="tuw-imageurl-submit"
            disabled={busy || !url.trim()}
          >
            {busy ? "Descargando…" : "Insertar"}
          </button>
        </div>
      </form>
    </Dialog>
  );
};
