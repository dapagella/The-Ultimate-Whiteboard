import { Dialog } from "@excalidraw/excalidraw/components/Dialog";

import { useAtom } from "../../app-jotai";

import { aboutDialogOpenAtom } from "./aboutState";

const UPSTREAM_REPO = "https://github.com/excalidraw/excalidraw";

export const AboutDialog = () => {
  const [isOpen, setIsOpen] = useAtom(aboutDialogOpenAtom);

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog
      size="small"
      title="Acerca de The Ultimate Whiteboard"
      onCloseRequest={() => setIsOpen(false)}
    >
      <div className="tuw-about">
        <p>
          <strong>The Ultimate Whiteboard</strong> es una pizarra digital
          personal construida sobre{" "}
          <a href={UPSTREAM_REPO} target="_blank" rel="noopener noreferrer">
            Excalidraw
          </a>
          .
        </p>
        <p>
          Excalidraw © 2020 Excalidraw y sus colaboradores, distribuido bajo la{" "}
          <a
            href={`${UPSTREAM_REPO}/blob/master/LICENSE`}
            target="_blank"
            rel="noopener noreferrer"
          >
            licencia MIT
          </a>
          . Los cambios propios de este proyecto también se publican bajo MIT.
        </p>
        <p className="tuw-about__small">
          Este proyecto no está afiliado ni respaldado por Excalidraw.
        </p>
      </div>
    </Dialog>
  );
};
