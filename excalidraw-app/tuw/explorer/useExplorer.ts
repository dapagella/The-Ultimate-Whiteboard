import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { getDefaultSheetStyle } from "../background/defaults";
import { getTuw } from "../workspace/desktopApi";
import { getSheetSession } from "../workspace/session";

import {
  createFolder,
  createSheet,
  deleteFromTrash,
  duplicateSheet,
  moveItems,
  openSheet,
  renameItem,
  restoreFromTrash,
  trashItems,
} from "./controller";
import { makeEditorBridge } from "./editorBridge";
import {
  ancestorsOf,
  applyClick,
  buildIndex,
  emptySelection,
  flatten,
  newItemParent,
  pruneSelection,
} from "./tree";

import type { TrashEntry, TreeNode } from "../../../desktop/src/api";
import type { ExplorerDeps, ExplorerWorkspace } from "./controller";
import type { Selection } from "./tree";

const EXPANDED_KEY = "tuw-explorer-expanded";

const loadExpanded = (): Set<string> => {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
};

/** Estado y acciones del panel de hojas y carpetas. */
export const useExplorer = (api: ExcalidrawImperativeAPI | null) => {
  const tuw = getTuw();
  const session = getSheetSession();

  const [tree, setTree] = useState<TreeNode[]>([]);
  const [trash, setTrash] = useState<TrashEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string | null>(
    session?.currentPath ?? null,
  );
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [query, setQuery] = useState("");
  const [root, setRoot] = useState("");

  const deps: ExplorerDeps | null = useMemo(
    () =>
      tuw && session && api
        ? {
            ws: tuw.workspace as unknown as ExplorerWorkspace,
            session,
            editor: makeEditorBridge(api),
            defaultStyle: getDefaultSheetStyle,
          }
        : null,
    [tuw, session, api],
  );

  const index = useMemo(() => buildIndex(tree), [tree]);
  const rows = useMemo(
    () => flatten(tree, expanded, query),
    [tree, expanded, query],
  );

  // --- carga ---------------------------------------------------------------
  const refresh = useCallback(async () => {
    if (!tuw) {
      return;
    }
    const [t, tr] = await Promise.all([
      tuw.workspace.list(),
      tuw.workspace.listTrash(),
    ]);
    if (t.ok) {
      setTree(t.value);
    } else {
      setError(t.error.message);
    }
    if (tr.ok) {
      setTrash(tr.value);
    }
    setLoaded(true);
  }, [tuw]);

  useEffect(() => {
    void refresh();
    void tuw?.workspace.getInfo().then((r) => r.ok && setRoot(r.value.root));
    // se vuelve a leer al volver a la ventana (por si algo cambió afuera, p. ej. Drive)
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, tuw]);

  useEffect(() => {
    if (!session) {
      return;
    }
    setActivePath(session.currentPath);
    return session.subscribe(() => {
      setActivePath(session.currentPath);
      void refresh();
    });
  }, [session, refresh]);

  // la hoja activa siempre queda visible: se despliegan sus carpetas
  useEffect(() => {
    if (!activePath) {
      return;
    }
    setExpanded((prev) => {
      const needed = ancestorsOf(activePath).filter((a) => !prev.has(a));
      return needed.length ? new Set([...prev, ...needed]) : prev;
    });
  }, [activePath]);

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
    } catch {
      // sin almacenamiento: no pasa nada
    }
  }, [expanded]);

  useEffect(() => {
    setSelection((s) => pruneSelection(s, index));
  }, [index]);

  // --- utilidades -----------------------------------------------------------
  const depsRef = useRef(deps);
  depsRef.current = deps;

  /** Ejecuta una acción mostrando el error (si hay) y refrescando el árbol. */
  const run = useCallback(
    async <T>(fn: (d: ExplorerDeps) => Promise<T>): Promise<T | undefined> => {
      const d = depsRef.current;
      if (!d) {
        return undefined;
      }
      setError(null);
      try {
        return await fn(d);
      } catch (e: any) {
        setError(e?.message ?? "No se pudo completar la operación.");
        return undefined;
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const expand = useCallback((path: string) => {
    setExpanded((prev) => (prev.has(path) ? prev : new Set([...prev, path])));
  }, []);

  const click = useCallback(
    (path: string, mods: { ctrl: boolean; shift: boolean }) =>
      setSelection((s) => applyClick(s, rows, path, mods)),
    [rows],
  );

  // --- acciones -------------------------------------------------------------
  const open = useCallback(
    (path: string) => run((d) => openSheet(d, path)),
    [run],
  );

  /** Crea con un nombre por defecto (numerado) y devuelve la ruta para renombrarla en el lugar. */
  const createNew = useCallback(
    async (kind: "sheet" | "folder", parent: string) =>
      run(async (d) => {
        if (parent) {
          expand(parent);
        }
        if (kind === "sheet") {
          return createSheet(d, parent, "Hoja nueva");
        }
        const base = "Carpeta nueva";
        for (let i = 1; i < 50; i++) {
          try {
            return await createFolder(
              d,
              parent,
              i === 1 ? base : `${base} (${i})`,
            );
          } catch (e: any) {
            if (e?.code !== "EXISTS") {
              throw e;
            }
          }
        }
        return undefined;
      }),
    [run, expand],
  );

  const rename = useCallback(
    (path: string, name: string) => run((d) => renameItem(d, path, name)),
    [run],
  );

  const move = useCallback(
    (paths: string[], dest: string) =>
      run(async (d) => {
        const r = await moveItems(d, paths, dest);
        if (dest) {
          expand(dest);
        }
        return r;
      }),
    [run, expand],
  );

  const trashSelected = useCallback(
    (paths: string[]) =>
      run(async (d) => {
        const entries = await trashItems(d, paths);
        api?.setToast({
          message:
            entries.length === 1
              ? `«${entries[0].name}» está en la papelera (15 días para recuperarla).`
              : `${entries.length} elementos están en la papelera (15 días para recuperarlos).`,
          duration: 5000,
          closable: true,
        });
        return entries;
      }),
    [run, api],
  );

  const duplicate = useCallback(
    (path: string) => run((d) => duplicateSheet(d, path)),
    [run],
  );

  const restore = useCallback(
    (id: string) => run((d) => restoreFromTrash(d, id)),
    [run],
  );

  const deleteForever = useCallback(
    async (ids: string[]) =>
      run(async (d) => {
        for (const id of ids) {
          await deleteFromTrash(d, id);
        }
      }),
    [run],
  );

  /** Cambiar la carpeta de trabajo: guarda lo pendiente y recarga la app con la nueva. */
  const changeRoot = useCallback(async () => {
    if (!tuw || !session) {
      return;
    }
    await session.flush();
    const res = await tuw.workspace.chooseRoot();
    if (res.ok && res.value) {
      window.location.reload();
    } else if (!res.ok) {
      setError(res.error.message);
    }
  }, [tuw, session]);

  return {
    available: !!tuw && !!session,
    tree,
    rows,
    index,
    trash,
    loaded,
    error,
    setError,
    activePath,
    expanded,
    selection,
    setSelection,
    query,
    setQuery,
    root,
    parentForNew: () => newItemParent(selection, index),
    toggle,
    expand,
    click,
    open,
    createNew,
    rename,
    move,
    trashSelected,
    duplicate,
    restore,
    deleteForever,
    changeRoot,
    refresh,
  };
};
