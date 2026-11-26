import { useCallback, useEffect, useState } from "react";

import { getTuw } from "../workspace/desktopApi";

import type { TuwAppInfo, UpdateStatus } from "../../../desktop/src/api";

const describe = (s: UpdateStatus): string => {
  switch (s.state) {
    case "checking":
      return "Buscando actualizaciones…";
    case "downloading":
      return `Descargando la versión ${s.version ?? ""} (${s.percent ?? 0} %)…`;
    case "ready":
      return `La versión ${s.version} está lista: se instala al cerrar la app.`;
    case "up-to-date":
      return "Tenés la última versión.";
    case "error":
      return s.message ?? "No se pudo buscar actualizaciones.";
    case "unsupported":
      return s.message ?? "";
    default:
      return "";
  }
};

/** Versión instalada + "Buscar actualizaciones" (solo en la app de escritorio). */
export const UpdateSection = () => {
  const tuw = getTuw();
  const [info, setInfo] = useState<TuwAppInfo | null>(null);
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });

  const refresh = useCallback(async () => {
    if (tuw) {
      setStatus(await tuw.updater.getStatus());
    }
  }, [tuw]);

  useEffect(() => {
    if (!tuw) {
      return;
    }
    void tuw.getAppInfo().then(setInfo);
    void refresh();
    // mientras el diálogo está abierto se sigue el avance de la descarga
    const timer = window.setInterval(() => void refresh(), 1500);
    return () => window.clearInterval(timer);
  }, [tuw, refresh]);

  if (!tuw) {
    return null;
  }

  const busy = status.state === "checking" || status.state === "downloading";

  return (
    <div className="tuw-about__updates" data-testid="tuw-updates">
      <div>
        <strong>Versión {info?.version ?? "…"}</strong>
      </div>
      <div className="tuw-about__status" data-testid="tuw-update-status">
        {describe(status)}
      </div>
      <div className="tuw-about__buttons">
        <button
          type="button"
          data-testid="tuw-update-check"
          disabled={busy || status.state === "unsupported"}
          onClick={async () => setStatus(await tuw.updater.check())}
        >
          Buscar actualizaciones
        </button>
        {status.state === "ready" && (
          <button
            type="button"
            data-testid="tuw-update-install"
            onClick={() => void tuw.updater.install()}
          >
            Reiniciar e instalar
          </button>
        )}
      </div>
    </div>
  );
};
