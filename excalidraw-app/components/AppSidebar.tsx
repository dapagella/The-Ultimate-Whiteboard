import {
  DefaultSidebar,
  Sidebar,
  setDefaultSidebarTab,
} from "@excalidraw/excalidraw";

import { SheetExplorer } from "../tuw/explorer/SheetExplorer";
import { SheetsTabIcon } from "../tuw/explorer/icons";
import { isDesktop } from "../tuw/workspace/desktopApi";

export const SHEETS_SIDEBAR_TAB = "sheets";

// el botón del panel lateral abre primero "Hojas" (después Elementos)
if (isDesktop()) {
  setDefaultSidebarTab(SHEETS_SIDEBAR_TAB);
}

export const AppSidebar = () => {
  if (!isDesktop()) {
    return <DefaultSidebar />;
  }
  return (
    <DefaultSidebar>
      <DefaultSidebar.TabTriggers>
        <Sidebar.TabTrigger tab={SHEETS_SIDEBAR_TAB}>
          <SheetsTabIcon />
        </Sidebar.TabTrigger>
      </DefaultSidebar.TabTriggers>
      <Sidebar.Tab tab={SHEETS_SIDEBAR_TAB}>
        <SheetExplorer />
      </Sidebar.Tab>
    </DefaultSidebar>
  );
};
