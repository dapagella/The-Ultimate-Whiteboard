import clsx from "clsx";
import { useEffect, useState } from "react";

import { capitalizeString } from "@excalidraw/common";

import { trackEvent } from "../analytics";
import { t } from "../i18n";

import { IconButton } from "./IconButton";
import {
  FreedrawToolPopover,
  TOOLS,
  getToolLetter,
  getToolShortcut,
  isToolButtonDisabled,
} from "./Tools";
import {
  NATIVE_TOOL_IDS,
  assignButton,
  assignmentKey,
  clearAssignments,
  describeAssignmentKey,
  getPinned,
  isAssignable,
  isNativeToolId,
  movePinned,
  nudgePinned,
  secondaryBits,
  setPinned,
  startAssigning,
  unpinItem,
  useToolbarState,
} from "./toolbarLayout";

import "./ToolbarRow.scss";

import type { ReactNode } from "react";

import type { AppClassProperties, UIAppState } from "../types";
import type { NativeToolId } from "./toolbarLayout";

export type ToolbarEntry = {
  id: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  disabled: boolean;
  title: string;
  keyBinding?: string | null;
  fillable?: boolean;
  select: (pointerType: string | null) => void;
  dragType?: NativeToolId;
};

/** Todas las funciones que se pueden poner en la barra (las del editor y las de la app). */
export const useToolbarEntries = (
  app: AppClassProperties,
  activeTool: UIAppState["activeTool"],
  hidden: readonly string[] = [],
): ToolbarEntry[] => {
  const store = useToolbarState();

  const natives: ToolbarEntry[] = NATIVE_TOOL_IDS.map((id) => {
    const cfg = TOOLS[id];
    const label = capitalizeString(t(`toolBar.${id}`));
    const hasShortcut = !!(cfg.letterKey || cfg.numericKey);
    const shortcut = hasShortcut ? getToolShortcut(id) : null;
    return {
      id,
      label,
      icon: cfg.icon,
      active: activeTool.type === id,
      disabled: isToolButtonDisabled(app, id),
      title: shortcut ? `${label} — ${shortcut}` : label,
      keyBinding: id === "hand" ? null : hasShortcut ? getToolLetter(id) : null,
      fillable: cfg.fillable,
      dragType: id,
      select: (pointerType) => {
        if (!app.state.penDetected && pointerType === "pen") {
          app.togglePenMode(true);
        }
        if (app.state.activeTool.type !== id) {
          trackEvent("toolbar", id, "ui");
          app.setActiveTool({ type: id });
        }
      },
    };
  });

  const hosts: ToolbarEntry[] = store.hostItems.map((h) => ({
    id: h.id,
    label: h.label,
    icon: h.icon,
    active: !!h.active,
    disabled: false,
    title: h.label,
    select: () => h.onSelect(),
  }));

  return [...natives, ...hosts].filter((e) => !hidden.includes(e.id));
};

type Menu = { id: string; x: number; y: number };

const ToolbarContextMenu = ({
  menu,
  entry,
  pinned,
  onClose,
}: {
  menu: Menu;
  entry: ToolbarEntry;
  pinned: string[];
  onClose: () => void;
}) => {
  const store = useToolbarState();
  const keys = Object.entries(store.assignments)
    .filter(([, v]) => v === entry.id)
    .map(([k]) => k);
  const i = pinned.indexOf(entry.id);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.(".tuw-tb-menu")) {
        onClose();
      }
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [onClose]);

  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div
      className="tuw-tb-menu"
      role="menu"
      data-testid="tuw-tb-menu"
      style={{ left: menu.x, top: menu.y }}
    >
      <div className="tuw-tb-menu__title">{entry.label}</div>
      <button
        role="menuitem"
        data-testid="tuw-tb-unpin"
        onClick={act(() => setPinned(unpinItem(pinned, entry.id)))}
      >
        Quitar de la barra (queda en ⋮)
      </button>
      <button
        role="menuitem"
        disabled={i <= 0}
        onClick={act(() => setPinned(nudgePinned(pinned, entry.id, -1)))}
      >
        ◀ Mover a la izquierda
      </button>
      <button
        role="menuitem"
        disabled={i === -1 || i >= pinned.length - 1}
        onClick={act(() => setPinned(nudgePinned(pinned, entry.id, 1)))}
      >
        Mover a la derecha ▶
      </button>
      <button
        role="menuitem"
        data-testid="tuw-tb-assign"
        onClick={act(() => startAssigning(entry.id))}
      >
        Asignar un botón del lápiz o del mouse…
      </button>
      {keys.map((k) => (
        <button
          key={k}
          role="menuitem"
          onClick={act(() => clearAssignments(entry.id))}
        >
          Quitar asignación ({describeAssignmentKey(k)})
        </button>
      ))}
    </div>
  );
};

/** Mientras se elige el botón: el primero que se apriete (lápiz o mouse) queda asignado. */
const AssignBanner = ({ entry }: { entry: ToolbarEntry }) => {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const onPointer = (ev: Event) => {
      const e = ev as PointerEvent;
      const bits = secondaryBits(e);
      if (!bits.length) {
        return;
      }
      stop(e);
      const bit = bits.find((b) => isAssignable(e.pointerType, b));
      if (!bit) {
        setMessage("Ese botón no se puede usar (el clic derecho del mouse).");
        return;
      }
      assignButton(assignmentKey(e.pointerType, bit), entry.id);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        startAssigning(null);
      }
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("pointermove", onPointer, true);
    window.addEventListener("contextmenu", stop, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("pointermove", onPointer, true);
      window.removeEventListener("contextmenu", stop, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [entry.id]);

  return (
    <div
      className="tuw-tb-assign"
      role="status"
      data-testid="tuw-tb-assign-banner"
    >
      <b>Apretá ahora el botón que querés usar para «{entry.label}»</b>
      <span>
        Un botón del costado del lápiz o del mouse (mantenelo apretado mientras
        apoyás la punta). En el driver de la tableta ponelo como «clic», no como
        «scroll/pan». Esc cancela.
      </span>
      {message && <em>{message}</em>}
      <button onClick={() => startAssigning(null)}>Cancelar</button>
    </div>
  );
};

/** Botones fijados, con menú (clic derecho) y arrastre para ordenarlos. */
export const ToolbarRow = ({
  app,
  activeTool,
  entries,
  compact = false,
}: {
  app: AppClassProperties;
  activeTool: UIAppState["activeTool"];
  entries: ToolbarEntry[];
  /** Barra compacta (tableta): dibujo libre y figura automática van juntos en un selector. */
  compact?: boolean;
}) => {
  const store = useToolbarState();
  const pinned = getPinned(store);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const assigning = store.assigning ? byId.get(store.assigning) : null;
  const menuEntry = menu ? byId.get(menu.id) : null;

  return (
    <>
      {pinned.map((id) => {
        const entry = byId.get(id);
        if (!entry) {
          return null;
        }
        return (
          <div
            key={id}
            className={clsx("tuw-tb-item", {
              "is-over": overId === id && dragId !== id,
              "is-dragging": dragId === id,
            })}
            draggable
            onDragStart={(e) => {
              setDragId(id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", id);
            }}
            onDragOver={(e) => {
              if (dragId) {
                e.preventDefault();
                setOverId(id);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId && dragId !== id) {
                setPinned(movePinned(pinned, dragId, pinned.indexOf(id)));
              }
              setDragId(null);
              setOverId(null);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenu({ id, x: e.clientX, y: e.clientY });
            }}
          >
            {compact && id === "freedraw" ? (
              <FreedrawToolPopover app={app} activeTool={activeTool} />
            ) : (
              <IconButton
                className={clsx({ fillable: entry.fillable })}
                type="toggle"
                icon={entry.icon}
                checked={entry.active}
                disabled={entry.disabled}
                title={entry.title}
                keyBindingLabel={entry.keyBinding || undefined}
                aria-label={entry.label}
                data-testid={`toolbar-${id}`}
                onPointerDown={(event) => {
                  if (entry.dragType && entry.dragType !== "lasso") {
                    app.toolDrag.handleButtonPointerDown(
                      entry.dragType,
                      event.nativeEvent,
                    );
                  }
                }}
                onSelect={({ pointerType }) => entry.select(pointerType)}
              />
            )}
          </div>
        );
      })}
      {menu && menuEntry && (
        <ToolbarContextMenu
          menu={menu}
          entry={menuEntry}
          pinned={pinned}
          onClose={() => setMenu(null)}
        />
      )}
      {assigning && <AssignBanner entry={assigning} />}
    </>
  );
};

export { isNativeToolId };
