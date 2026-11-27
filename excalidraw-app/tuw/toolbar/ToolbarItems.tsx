import { registerToolbarItems } from "@excalidraw/excalidraw";
import { useEffect } from "react";

import type { HostToolbarItem } from "@excalidraw/excalidraw";

import { appJotaiStore, useAtom } from "../../app-jotai";
import { axesModeAtom } from "../axes/axesState";
import {
  imageUrlDialogOpenAtom,
  latexDialogAtom,
} from "../content/contentState";
import { isDesktop } from "../workspace/desktopApi";

const svg = (children: React.ReactNode) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const AXES_2D = svg(
  <>
    <path d="M5 19V4M5 19h15" />
    <path d="M2.5 6.5 5 4l2.5 2.5M17.5 16.5 20 19l-2.5 2.5" />
  </>,
);
const AXES_3D = svg(
  <>
    <path d="M12 12V3M12 12h9M12 12l-7 7" />
    <path d="M9.5 5.5 12 3l2.5 2.5M18.5 9.5 21 12l-2.5 2.5M5 14.5V19h4.5" />
  </>,
);
const FORMULA = svg(<path d="M18 5H7l6 7-6 7h11" />);
const IMAGE_URL = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
  </>,
);

/** Registra en la barra de funciones las herramientas propias: ejes, fórmula e imagen por URL. */
export const ToolbarItems = () => {
  const [axes, setAxes] = useAtom(axesModeAtom);

  useEffect(() => {
    const items: HostToolbarItem[] = [
      {
        id: "axes2d",
        label: "Eje 2D",
        icon: AXES_2D,
        active: axes === 2,
        onSelect: () => setAxes(axes === 2 ? null : 2),
      },
      {
        id: "axes3d",
        label: "Eje 3D",
        icon: AXES_3D,
        active: axes === 3,
        onSelect: () => setAxes(axes === 3 ? null : 3),
      },
      {
        id: "latex",
        label: "Fórmula",
        icon: FORMULA,
        onSelect: () => appJotaiStore.set(latexDialogAtom, { mode: "new" }),
      },
    ];
    if (isDesktop()) {
      items.push({
        id: "imageurl",
        label: "Imagen desde URL",
        icon: IMAGE_URL,
        onSelect: () => appJotaiStore.set(imageUrlDialogOpenAtom, true),
      });
    }
    registerToolbarItems(items);
  }, [axes, setAxes]);

  return null;
};
