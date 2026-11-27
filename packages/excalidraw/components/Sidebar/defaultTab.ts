import { DEFAULT_SIDEBAR } from "@excalidraw/common";

let defaultTab: string = DEFAULT_SIDEBAR.defaultTab;

/** Pestaña que se abre al tocar el botón del panel lateral (TUW: "Hojas" en la app de escritorio). */
export const setDefaultSidebarTab = (tab: string) => {
  defaultTab = tab;
};

export const getDefaultSidebarTab = () => defaultTab;
