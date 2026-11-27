import clsx from "clsx";
import { useState } from "react";

import { useTunnels } from "../context/tunnels";
import { t } from "../i18n";

import { useEditorInterface, useStylesPanelMode } from "./App";
import { HintViewer } from "./HintViewer";
import { Island } from "./Island";
import { LockButton } from "./LockButton";
import { PenModeButton } from "./PenModeButton";
import Stack from "./Stack";
import { ToolbarRow, useToolbarEntries } from "./ToolbarRow";
import DropdownMenu from "./dropdownMenu/DropdownMenu";
import { MagicIcon, mermaidLogoIcon, DotsIcon } from "./icons";
import { isToolButtonDisabled } from "./Tools";
import {
  getPinned,
  pinItem,
  resetToolbarLayout,
  setPinned,
  useToolbarState,
} from "./toolbarLayout";

import type { ToolbarEntry } from "./ToolbarRow";
import type {
  AppClassProperties,
  AppProps,
  AppState,
  UIAppState,
} from "../types";

const ExtraToolsDropdown = ({
  app,
  activeTool,
  setAppState,
  entries,
  compact,
}: {
  app: AppClassProperties;
  activeTool: UIAppState["activeTool"];
  setAppState: React.Component<any, AppState>["setState"];
  entries: ToolbarEntry[];
  compact: boolean;
}) => {
  const store = useToolbarState();
  const pinnedIds = getPinned(store);
  const unpinned = entries.filter((e) => !pinnedIds.includes(e.id));
  // en la barra compacta la figura automática se agrupa bajo el dibujo libre
  const activeUnpinned = unpinned.find(
    (e) => e.active && !(compact && e.id === "autoshape"),
  );
  const [isExtraToolsMenuOpen, setIsExtraToolsMenuOpen] = useState(false);
  const { TTDDialogTriggerTunnel } = useTunnels();

  return (
    <DropdownMenu open={isExtraToolsMenuOpen}>
      <DropdownMenu.Trigger
        className={clsx("App-toolbar__extra-tools-trigger", {
          "App-toolbar__extra-tools-trigger--selected": !!activeUnpinned,
        })}
        onToggle={() => {
          setIsExtraToolsMenuOpen(!isExtraToolsMenuOpen);
          setAppState({ openMenu: null, openPopup: null });
        }}
        title={t("toolBar.extraTools")}
      >
        {activeUnpinned ? activeUnpinned.icon : DotsIcon}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        onClickOutside={() => setIsExtraToolsMenuOpen(false)}
        onSelect={() => setIsExtraToolsMenuOpen(false)}
        className="App-toolbar__extra-tools-dropdown"
      >
        {unpinned.map((entry) => (
          <DropdownMenu.Item
            key={entry.id}
            onSelect={() => entry.select(null)}
            icon={entry.icon as React.ReactElement}
            data-testid={`toolbar-${entry.id}`}
            selected={entry.active}
            disabled={entry.disabled}
            badge={
              <span
                role="button"
                tabIndex={0}
                className="tuw-tb-pin"
                data-testid={`tuw-tb-pin-${entry.id}`}
                title="Fijar en la barra"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPinned(pinItem(getPinned(), entry.id));
                }}
              >
                📌
              </span>
            }
          >
            {entry.label}
          </DropdownMenu.Item>
        ))}
        {unpinned.length === 0 && (
          <div className="tuw-tb-empty">Todo está fijado en la barra.</div>
        )}
        <DropdownMenu.Item onSelect={() => resetToolbarLayout()}>
          Restaurar la barra original
        </DropdownMenu.Item>
        <div style={{ margin: "6px 0", fontSize: 14, fontWeight: 600 }}>
          Generate
        </div>
        {app.props.aiEnabled !== false && <TTDDialogTriggerTunnel.Out />}
        <DropdownMenu.Item
          onSelect={() => app.setOpenDialog({ name: "ttd", tab: "mermaid" })}
          icon={mermaidLogoIcon}
          data-testid="toolbar-embeddable"
        >
          {t("toolBar.mermaidToExcalidraw")}
        </DropdownMenu.Item>
        {app.props.aiEnabled !== false && app.plugins.diagramToCode && (
          <DropdownMenu.Item
            onSelect={() => app.onMagicframeToolSelect()}
            icon={MagicIcon}
            data-testid="toolbar-magicframe"
            badge={<DropdownMenu.Item.Badge>AI</DropdownMenu.Item.Badge>}
            disabled={isToolButtonDisabled(app, "magicframe")}
          >
            {t("toolBar.magicframe")}
          </DropdownMenu.Item>
        )}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};

/** the main (desktop/tablet) toolbar island */
export const Toolbar = ({
  app,
  appState,
  setAppState,
  UIOptions,
  onPenModeToggle,
  onLockToggle,
  heading,
}: {
  app: AppClassProperties;
  appState: UIAppState;
  setAppState: React.Component<any, AppState>["setState"];
  UIOptions: AppProps["UIOptions"];
  onPenModeToggle: AppClassProperties["togglePenMode"];
  onLockToggle: () => void;
  heading: React.ReactNode;
}) => {
  const editorInterface = useEditorInterface();
  const isCompactStylesPanel = useStylesPanelMode() === "compact";

  const activeTool = appState.activeTool;
  const entries = useToolbarEntries(app, activeTool, [
    ...(UIOptions.tools?.image === false ? ["image"] : []),
  ]);

  return (
    <Island
      padding={1}
      className={clsx("App-toolbar", {
        "zen-mode": appState.zenModeEnabled,
        "App-toolbar--compact": isCompactStylesPanel,
      })}
      data-viewport-ui="top"
    >
      <HintViewer
        appState={appState}
        isMobile={editorInterface.formFactor === "phone"}
        editorInterface={editorInterface}
        app={app}
      />
      {heading}
      <Stack.Row gap={isCompactStylesPanel ? 0.5 : 1}>
        {/* in compact UI the pen mode button is rendered as a separate
            floating button below the compact actions menu */}
        {!isCompactStylesPanel && (
          <PenModeButton
            checked={appState.penMode}
            onChange={() => onPenModeToggle(null)}
            title={t("toolBar.penMode")}
            penDetected={appState.penDetected}
          />
        )}
        {app.props.activeTool == null && (
          <>
            <LockButton
              checked={appState.activeTool.locked}
              onChange={onLockToggle}
              title={t("toolBar.lock")}
              // the active tool — including its lock state — is host-controlled
              disabled={app.props.activeTool != null}
            />

            <div
              className="App-toolbar__divider"
              style={{ marginRight: "0.25rem" }}
            />
          </>
        )}

        <ToolbarRow
          app={app}
          activeTool={activeTool}
          entries={entries}
          compact={isCompactStylesPanel}
        />

        <div
          className="App-toolbar__divider"
          style={{ marginLeft: "0.25rem" }}
        />

        <ExtraToolsDropdown
          app={app}
          activeTool={activeTool}
          setAppState={setAppState}
          entries={entries}
          compact={isCompactStylesPanel}
        />
      </Stack.Row>
    </Island>
  );
};
