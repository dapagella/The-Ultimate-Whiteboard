import { getTuw } from "./desktopApi";
import { SheetSession } from "./sheetSession";

import type { SheetSessionEvents } from "./sheetSession";

/** Callbacks que la interfaz registra para mostrar avisos (toasts). */
let events: SheetSessionEvents = {
  onConflict: () => {},
  onError: () => {},
};

export const setSessionEvents = (next: SheetSessionEvents) => {
  events = next;
};

let session: SheetSession | null = null;

/** Sesión única de la hoja abierta (solo en la app de escritorio). */
export const getSheetSession = (): SheetSession | null => {
  const tuw = getTuw();
  if (!tuw) {
    return null;
  }
  if (!session) {
    const ws = tuw.workspace;
    session = new SheetSession(
      {
        readSheet: ws.readSheet,
        writeSheet: ws.writeSheet,
        createSheet: ws.createSheet,
        setLastSheet: ws.setLastSheet,
      },
      {
        onConflict: (info) => events.onConflict(info),
        onError: (message) => events.onError(message),
      },
    );
  }
  return session;
};
