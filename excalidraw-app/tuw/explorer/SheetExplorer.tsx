import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import ConfirmDialog from "@excalidraw/excalidraw/components/ConfirmDialog";
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { appJotaiStore } from "../../app-jotai";

import { exportDialogAtom } from "../export/exportState";

import {
  ChevronIcon,
  FolderIcon,
  FolderOpenIcon,
  NewFolderIcon,
  NewSheetIcon,
  SheetIcon,
  TrashBinIcon,
} from "./icons";
import {
  TRASH_DAYS,
  parentOf,
  topLevelOnly,
  trashDaysLeft,
  validDestinations,
  validateMove,
} from "./tree";

import { useExplorer } from "./useExplorer";

import "./explorer.scss";

import type { Row } from "./tree";

type MenuState = { x: number; y: number; paths: string[] } | null;
type ConfirmState = {
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => void;
} | null;

/** Campo de renombrar en el lugar: confirma una sola vez (Enter o al perder el foco). */
const RenameInput = ({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) => {
  const done = useRef(false);
  const finish = (fn: () => void) => {
    if (!done.current) {
      done.current = true;
      fn();
    }
  };
  return (
    <input
      className="tuw-ex__rename"
      autoFocus
      defaultValue={initial}
      maxLength={120}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          const value = e.currentTarget.value;
          finish(() => onCommit(value));
        } else if (e.key === "Escape") {
          finish(onCancel);
        }
      }}
      onBlur={(e) => {
        const value = e.currentTarget.value;
        finish(() => onCommit(value));
      }}
    />
  );
};

const isMac =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

export const SheetExplorer = () => {
  const api = useExcalidrawAPI();
  const ex = useExplorer(api);

  const [view, setView] = useState<"tree" | "trash">("tree");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [moveFor, setMoveFor] = useState<string[] | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [dragPaths, setDragPaths] = useState<string[] | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const springTimer = useRef<{ path: string; id: number } | null>(null);

  const portalHost = (): Element =>
    rootRef.current?.closest(".excalidraw") ?? document.body;

  // el menú contextual se cierra con cualquier clic, Escape o desplazamiento
  useEffect(() => {
    if (!menu) {
      return;
    }
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  const selectedPaths = useMemo(
    () => topLevelOnly(ex.selection.selected),
    [ex.selection],
  );

  if (!ex.available) {
    return (
      <div className="tuw-ex tuw-ex--empty">
        Las hojas y carpetas están disponibles en la app de escritorio.
      </div>
    );
  }

  // --- acciones con confirmación ---------------------------------------------
  const askTrash = (paths: string[]) => {
    const top = topLevelOnly(paths);
    if (!top.length) {
      return;
    }
    const names = top.map((p) => ex.index.get(p)?.name ?? p);
    const hasFolder = top.some((p) => ex.index.get(p)?.type === "folder");
    setConfirm({
      title:
        top.length === 1
          ? `¿Mover «${names[0]}» a la papelera?`
          : `¿Mover ${top.length} elementos a la papelera?`,
      message: `${
        hasFolder ? "Las carpetas se mueven con todo su contenido. " : ""
      }Podés recuperarlos desde la papelera durante ${TRASH_DAYS} días.`,
      confirmText: "Mover a la papelera",
      onConfirm: () => void ex.trashSelected(top),
    });
  };

  const newItem = async (kind: "sheet" | "folder", parent: string) => {
    setView("tree");
    const path = await ex.createNew(kind, parent);
    if (path) {
      ex.setSelection({ selected: new Set([path]), anchor: path });
      setRenaming(path);
    }
  };

  const commitRename = async (path: string, name: string) => {
    setRenaming(null);
    const current = ex.index.get(path)?.name;
    if (!name.trim() || name.trim() === current) {
      return;
    }
    const newPath = await ex.rename(path, name);
    if (newPath) {
      ex.setSelection({ selected: new Set([newPath]), anchor: newPath });
    }
  };

  const activate = (row: Row) => {
    if (row.node.type === "folder") {
      ex.toggle(row.node.path);
    } else {
      void ex.open(row.node.path);
    }
  };

  // --- teclado ---------------------------------------------------------------
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (renaming || (e.target as HTMLElement).tagName === "INPUT") {
      return;
    }
    const focusPath =
      ex.selection.anchor ?? ex.selection.selected.values().next().value;
    const i = ex.rows.findIndex((r) => r.node.path === focusPath);
    const mod = isMac ? e.metaKey : e.ctrlKey;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        e.preventDefault();
        const next =
          ex.rows[
            Math.max(
              0,
              Math.min(
                ex.rows.length - 1,
                i + (e.key === "ArrowDown" ? 1 : -1),
              ),
            )
          ];
        if (next) {
          ex.click(next.node.path, { ctrl: false, shift: e.shiftKey });
        }
        break;
      }
      case "ArrowRight":
        if (i >= 0 && ex.rows[i].node.type === "folder") {
          e.preventDefault();
          ex.expand(ex.rows[i].node.path);
        }
        break;
      case "ArrowLeft":
        if (
          i >= 0 &&
          ex.rows[i].node.type === "folder" &&
          ex.expanded.has(ex.rows[i].node.path)
        ) {
          e.preventDefault();
          ex.toggle(ex.rows[i].node.path);
        }
        break;
      case "Enter":
        if (i >= 0) {
          e.preventDefault();
          activate(ex.rows[i]);
        }
        break;
      case "F2":
        if (selectedPaths.length === 1) {
          e.preventDefault();
          setRenaming(selectedPaths[0]);
        }
        break;
      case "Delete":
        if (selectedPaths.length) {
          e.preventDefault();
          askTrash(selectedPaths);
        }
        break;
      case "a":
      case "A":
        if (mod) {
          e.preventDefault();
          ex.setSelection({
            selected: new Set(ex.rows.map((r) => r.node.path)),
            anchor: ex.rows[0]?.node.path ?? null,
          });
        }
        break;
      default:
    }
  };

  // --- arrastrar y soltar ------------------------------------------------------
  const clearSpring = () => {
    if (springTimer.current) {
      window.clearTimeout(springTimer.current.id);
      springTimer.current = null;
    }
  };
  const endDrag = () => {
    clearSpring();
    setDragPaths(null);
    setDropTarget(null);
  };
  const canDrop = (dest: string) =>
    !!dragPaths && validateMove(dragPaths, dest, ex.index).ok;
  const dropInto = (dest: string) => {
    const paths = dragPaths;
    endDrag();
    if (paths) {
      void ex.move(paths, dest);
    }
  };

  // --- menú contextual ---------------------------------------------------------
  const openMenu = (e: React.MouseEvent, path: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    let paths = selectedPaths;
    if (path && !ex.selection.selected.has(path)) {
      ex.click(path, { ctrl: false, shift: false });
      paths = [path];
    }
    setMenu({ x: e.clientX, y: e.clientY, paths: path ? paths : [] });
  };

  const renderMenu = () => {
    if (!menu) {
      return null;
    }
    const { paths } = menu;
    const single = paths.length === 1 ? ex.index.get(paths[0]) : undefined;
    const items: { label: string; onClick: () => void; danger?: boolean }[] =
      [];
    if (single?.type === "sheet") {
      items.push({ label: "Abrir", onClick: () => void ex.open(single.path) });
    }
    if (!paths.length || single?.type === "folder") {
      const parent = single?.type === "folder" ? single.path : "";
      items.push({
        label: "Nueva hoja aquí",
        onClick: () => void newItem("sheet", parent),
      });
      items.push({
        label: "Nueva carpeta aquí",
        onClick: () => void newItem("folder", parent),
      });
    }
    if (single) {
      items.push({
        label: "Renombrar  (F2)",
        onClick: () => setRenaming(single.path),
      });
    }
    if (single?.type === "sheet") {
      items.push({
        label: "Duplicar",
        onClick: () => void ex.duplicate(single.path),
      });
      items.push({
        label: "Exportar hoja…",
        onClick: () =>
          appJotaiStore.set(exportDialogAtom, { path: single.path }),
      });
    }
    if (paths.length) {
      items.push({
        label:
          paths.length > 1 ? `Mover ${paths.length} elementos a…` : "Mover a…",
        onClick: () => setMoveFor(paths),
      });
      items.push({
        label:
          paths.length > 1
            ? `Mover ${paths.length} a la papelera`
            : "Mover a la papelera",
        onClick: () => askTrash(paths),
        danger: true,
      });
    }
    return createPortal(
      <div
        className="tuw-ex__menu"
        role="menu"
        style={{
          left: Math.min(menu.x, window.innerWidth - 220),
          top: Math.min(menu.y, window.innerHeight - items.length * 34 - 12),
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {items.map((it) => (
          <button
            key={it.label}
            role="menuitem"
            className={it.danger ? "is-danger" : undefined}
            onClick={() => {
              setMenu(null);
              it.onClick();
            }}
          >
            {it.label}
          </button>
        ))}
      </div>,
      portalHost(),
    );
  };

  // --- piezas de la interfaz ---------------------------------------------------
  const renderRow = (row: Row) => {
    const { node, depth } = row;
    const isFolder = node.type === "folder";
    const isOpen = isFolder && (ex.query ? true : ex.expanded.has(node.path));
    const isActive = node.path === ex.activePath;
    const isSelected = ex.selection.selected.has(node.path);
    const isDrop = dropTarget === node.path;
    const isRenaming = renaming === node.path;

    return (
      <div
        key={node.path}
        role="treeitem"
        aria-level={depth + 1}
        aria-selected={isSelected}
        aria-expanded={isFolder ? isOpen : undefined}
        data-path={node.path}
        data-testid="tuw-ex-row"
        draggable={!isRenaming}
        className={[
          "tuw-ex__row",
          isActive && "is-active",
          isSelected && "is-selected",
          isDrop && "is-drop",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={(e) => {
          const mods = {
            ctrl: isMac ? e.metaKey : e.ctrlKey,
            shift: e.shiftKey,
          };
          ex.click(node.path, mods);
          if (!mods.ctrl && !mods.shift) {
            activate(row);
          }
        }}
        onContextMenu={(e) => openMenu(e, node.path)}
        onDragStart={(e) => {
          const paths = ex.selection.selected.has(node.path)
            ? topLevelOnly(ex.selection.selected)
            : [node.path];
          if (!ex.selection.selected.has(node.path)) {
            ex.click(node.path, { ctrl: false, shift: false });
          }
          setDragPaths(paths);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", paths.join("\n"));
        }}
        onDragEnd={endDrag}
        onDragOver={(e) => {
          if (!isFolder) {
            return; // se resuelve en el contenedor (raíz)
          }
          e.stopPropagation();
          if (!canDrop(node.path)) {
            e.dataTransfer.dropEffect = "none"; // cursor de "no permitido"
            setDropTarget(null);
            return;
          }
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropTarget(node.path);
          if (!isOpen && springTimer.current?.path !== node.path) {
            clearSpring();
            springTimer.current = {
              path: node.path,
              id: window.setTimeout(() => ex.expand(node.path), 700),
            };
          }
        }}
        onDrop={(e) => {
          if (isFolder && canDrop(node.path)) {
            e.preventDefault();
            e.stopPropagation();
            dropInto(node.path);
          }
        }}
      >
        <span className="tuw-ex__chev">
          {isFolder ? <ChevronIcon open={isOpen} /> : null}
        </span>
        <span className="tuw-ex__icon">
          {isFolder ? (
            isOpen ? (
              <FolderOpenIcon />
            ) : (
              <FolderIcon />
            )
          ) : (
            <SheetIcon />
          )}
        </span>
        {isRenaming ? (
          <RenameInput
            initial={node.name}
            onCommit={(name) => void commitRename(node.path, name)}
            onCancel={() => setRenaming(null)}
          />
        ) : (
          <span className="tuw-ex__name" title={node.path}>
            {node.name}
          </span>
        )}
      </div>
    );
  };

  const renderMoveDialog = () => {
    if (!moveFor) {
      return null;
    }
    const dests = validDestinations(moveFor, ex.tree, ex.index);
    return (
      <Dialog
        size="small"
        title="Mover a…"
        onCloseRequest={() => setMoveFor(null)}
      >
        <div className="tuw-ex__move">
          {dests.length === 0 && <p>No hay otra carpeta disponible.</p>}
          {dests.map((d) => (
            <button
              key={d.path || "/"}
              className="tuw-ex__move-item"
              style={{ paddingLeft: 10 + d.depth * 16 }}
              onClick={() => {
                const paths = moveFor;
                setMoveFor(null);
                void ex.move(paths, d.path);
              }}
            >
              {d.path === "" ? <FolderOpenIcon /> : <FolderIcon />}
              <span>{d.name}</span>
            </button>
          ))}
        </div>
      </Dialog>
    );
  };

  const renderTrash = () => (
    <div className="tuw-ex__trash">
      <div className="tuw-ex__trash-head">
        <button className="tuw-ex__link" onClick={() => setView("tree")}>
          ← Volver
        </button>
        {ex.trash.length > 0 && (
          <button
            className="tuw-ex__link is-danger"
            onClick={() =>
              setConfirm({
                title: "¿Vaciar la papelera?",
                message:
                  "Se eliminarán definitivamente todos sus elementos. No se puede deshacer.",
                confirmText: "Vaciar papelera",
                onConfirm: () =>
                  void ex.deleteForever(ex.trash.map((t) => t.id)),
              })
            }
          >
            Vaciar papelera
          </button>
        )}
      </div>
      <p className="tuw-ex__hint">
        Lo que borrás se queda acá {TRASH_DAYS} días y después se elimina
        definitivamente.
      </p>
      {ex.trash.length === 0 && (
        <div className="tuw-ex__none">La papelera está vacía.</div>
      )}
      {ex.trash.map((t) => {
        const left = trashDaysLeft(t, Date.now());
        return (
          <div
            key={t.id}
            className="tuw-ex__trash-item"
            data-testid="tuw-ex-trash-item"
          >
            <span className="tuw-ex__icon">
              {t.type === "folder" ? <FolderIcon /> : <SheetIcon />}
            </span>
            <div className="tuw-ex__trash-info">
              <div className="tuw-ex__name">{t.name}</div>
              <div className="tuw-ex__sub">
                {parentOf(t.originalPath)
                  ? `de «${parentOf(t.originalPath)}» · `
                  : ""}
                {left === 1 ? "falta 1 día" : `faltan ${left} días`}
              </div>
            </div>
            <button
              className="tuw-ex__btn"
              onClick={() => void ex.restore(t.id)}
            >
              Restaurar
            </button>
            <button
              className="tuw-ex__btn is-danger"
              title="Eliminar definitivamente"
              onClick={() =>
                setConfirm({
                  title: `¿Eliminar «${t.name}» definitivamente?`,
                  message: "No se puede deshacer.",
                  confirmText: "Eliminar",
                  onConfirm: () => void ex.deleteForever([t.id]),
                })
              }
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      className="tuw-ex"
      ref={rootRef}
      data-testid="tuw-explorer"
      onContextMenu={(e) => {
        if (view === "tree") {
          openMenu(e, null);
        }
      }}
    >
      <div className="tuw-ex__header">
        <div className="tuw-ex__title">Hojas</div>
        <div className="tuw-ex__actions">
          <button
            className="tuw-ex__iconbtn"
            title="Nueva hoja"
            aria-label="Nueva hoja"
            onClick={() => void newItem("sheet", ex.parentForNew())}
          >
            <NewSheetIcon />
          </button>
          <button
            className="tuw-ex__iconbtn"
            title="Nueva carpeta"
            aria-label="Nueva carpeta"
            onClick={() => void newItem("folder", ex.parentForNew())}
          >
            <NewFolderIcon />
          </button>
          <button
            className={`tuw-ex__iconbtn${view === "trash" ? " is-on" : ""}`}
            title="Papelera"
            aria-label="Papelera"
            onClick={() => setView(view === "trash" ? "tree" : "trash")}
          >
            <TrashBinIcon />
            {ex.trash.length > 0 && (
              <span className="tuw-ex__badge">{ex.trash.length}</span>
            )}
          </button>
        </div>
      </div>

      {ex.error && (
        <div className="tuw-ex__error" role="alert">
          <span>{ex.error}</span>
          <button aria-label="Cerrar" onClick={() => ex.setError(null)}>
            ✕
          </button>
        </div>
      )}

      {view === "trash" ? (
        renderTrash()
      ) : (
        <>
          <input
            className="tuw-ex__search"
            type="search"
            placeholder="Buscar…"
            value={ex.query}
            onChange={(e) => ex.setQuery(e.target.value)}
          />
          <div
            className={`tuw-ex__list${
              dropTarget === "" ? " is-drop-root" : ""
            }`}
            role="tree"
            tabIndex={0}
            onKeyDown={onKeyDown}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                ex.setSelection({ selected: new Set(), anchor: null });
              }
            }}
            onDragOver={(e) => {
              if (canDrop("")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dropTarget !== "") {
                  clearSpring();
                  setDropTarget("");
                }
              } else if (dragPaths) {
                e.dataTransfer.dropEffect = "none";
              }
            }}
            onDrop={(e) => {
              if (canDrop("")) {
                e.preventDefault();
                dropInto("");
              }
            }}
          >
            {!ex.loaded && <div className="tuw-ex__none">Cargando…</div>}
            {ex.loaded && ex.rows.length === 0 && (
              <div className="tuw-ex__none">
                {ex.query
                  ? "Sin resultados."
                  : "Todavía no hay hojas. Creá la primera con el botón de arriba."}
              </div>
            )}
            {ex.rows.map(renderRow)}
          </div>
          <div className="tuw-ex__footer" title={ex.root}>
            <span className="tuw-ex__root">{ex.root}</span>
            <button
              className="tuw-ex__link"
              onClick={() => void ex.changeRoot()}
            >
              Cambiar carpeta…
            </button>
          </div>
        </>
      )}

      {renderMenu()}
      {renderMoveDialog()}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          confirmText={confirm.confirmText}
          cancelText="Cancelar"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const action = confirm.onConfirm;
            setConfirm(null);
            action();
          }}
        >
          <p className="tuw-ex__confirm-text">{confirm.message}</p>
        </ConfirmDialog>
      )}
    </div>
  );
};
