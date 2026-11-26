import { eyeIcon, helpIcon } from "@excalidraw/excalidraw/components/icons";
import { MainMenu } from "@excalidraw/excalidraw/index";
import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import React from "react";

import { isDevEnv } from "@excalidraw/common";

import type { Theme } from "@excalidraw/element/types";

import { LanguageList } from "../app-language/LanguageList";
import { appJotaiStore } from "../app-jotai";
import { aboutDialogOpenAtom } from "../tuw/about/aboutState";
import { backgroundDialogOpenAtom } from "../tuw/background/backgroundState";
import {
  imageUrlDialogOpenAtom,
  latexDialogAtom,
} from "../tuw/content/contentState";
import { SheetsTabIcon } from "../tuw/explorer/icons";
import { penDialogOpenAtom } from "../tuw/pen/penState";
import { isDesktop } from "../tuw/workspace/desktopApi";

import { SHEETS_SIDEBAR_TAB } from "./AppSidebar";

import { saveDebugState } from "./DebugCanvas";

const SheetBackgroundIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 9.33h16M4 14.66h16M9.33 4v16M14.66 4v16" />
  </svg>
);

export const AppMainMenu: React.FC<{
  onCollabDialogOpen: () => any;
  isCollaborating: boolean;
  isCollabEnabled: boolean;
  theme: Theme | "system";
  refresh: () => void;
}> = React.memo((props) => {
  const excalidrawAPI = useExcalidrawAPI();
  return (
    <MainMenu>
      {isDesktop() && (
        <MainMenu.Item
          icon={<SheetsTabIcon />}
          onSelect={() =>
            excalidrawAPI?.toggleSidebar({
              name: "default",
              tab: SHEETS_SIDEBAR_TAB,
              force: true,
            })
          }
        >
          Hojas y carpetas
        </MainMenu.Item>
      )}
      <MainMenu.DefaultItems.LoadScene />
      <MainMenu.DefaultItems.SaveToActiveFile />
      <MainMenu.DefaultItems.Export />
      <MainMenu.DefaultItems.SaveAsImage />
      <MainMenu.Item
        onSelect={() => appJotaiStore.set(latexDialogAtom, { mode: "new" })}
      >
        Insertar fórmula…
      </MainMenu.Item>
      {isDesktop() && (
        <MainMenu.Item
          onSelect={() => appJotaiStore.set(imageUrlDialogOpenAtom, true)}
        >
          Insertar imagen desde URL…
        </MainMenu.Item>
      )}
      {props.isCollabEnabled && (
        <MainMenu.DefaultItems.LiveCollaborationTrigger
          isCollaborating={props.isCollaborating}
          onSelect={() => props.onCollabDialogOpen()}
        />
      )}
      <MainMenu.Item
        onSelect={() => appJotaiStore.set(penDialogOpenAtom, true)}
      >
        Lápiz y tableta…
      </MainMenu.Item>
      <MainMenu.DefaultItems.CommandPalette className="highlighted" />
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.Help />
      <MainMenu.DefaultItems.ClearCanvas />
      <MainMenu.Separator />
      <MainMenu.Item
        icon={helpIcon}
        onSelect={() => appJotaiStore.set(aboutDialogOpenAtom, true)}
      >
        Acerca de
      </MainMenu.Item>
      {isDevEnv() && (
        <MainMenu.Item
          icon={eyeIcon}
          onSelect={() => {
            if (window.visualDebug) {
              delete window.visualDebug;
              saveDebugState({ enabled: false });
            } else {
              window.visualDebug = { data: [] };
              saveDebugState({ enabled: true });
            }
            props?.refresh();
          }}
        >
          Visual Debug
        </MainMenu.Item>
      )}
      <MainMenu.Separator />
      <MainMenu.DefaultItems.Preferences />
      <MainMenu.DefaultItems.ToggleTheme allowSystemTheme theme={props.theme} />
      <MainMenu.ItemCustom>
        <LanguageList style={{ width: "100%" }} />
      </MainMenu.ItemCustom>
      <MainMenu.DefaultItems.ChangeCanvasBackground />
      <MainMenu.Item
        icon={<SheetBackgroundIcon />}
        onSelect={() => appJotaiStore.set(backgroundDialogOpenAtom, true)}
      >
        Fondo de la hoja…
      </MainMenu.Item>
    </MainMenu>
  );
});
