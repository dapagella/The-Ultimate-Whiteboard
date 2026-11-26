/**
 * Lógica PURA del explorador de carpetas y hojas (sin React ni Electron):
 * aplanado del árbol, búsqueda, selección múltiple y validación de movimientos.
 * Las rutas son relativas al espacio de trabajo ("a/b/c.excalidraw"; "" = raíz).
 */
import type { TrashEntry, TreeNode } from "../../../desktop/src/api";

export type FolderNode = Extract<TreeNode, { type: "folder" }>;
export type SheetNode = Extract<TreeNode, { type: "sheet" }>;

export type Row = { node: TreeNode; depth: number };

export const TRASH_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------
export const parentOf = (path: string): string =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

/** "a/b/c" → ["a", "a/b"] (sin la raíz ni el propio elemento). */
export const ancestorsOf = (path: string): string[] => {
  const parts = path.split("/");
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    out.push(parts.slice(0, i).join("/"));
  }
  return out;
};

/** ¿`child` es `ancestor` o está dentro de él? */
export const isSameOrInside = (ancestor: string, child: string): boolean =>
  child === ancestor || child.startsWith(`${ancestor}/`);

// ---------------------------------------------------------------------------
// Árbol
// ---------------------------------------------------------------------------
export const buildIndex = (nodes: TreeNode[]): Map<string, TreeNode> => {
  const index = new Map<string, TreeNode>();
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      index.set(n.path, n);
      if (n.type === "folder") {
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return index;
};

export const collectFolders = (nodes: TreeNode[]): FolderNode[] => {
  const out: FolderNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      if (n.type === "folder") {
        out.push(n);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
};

export const countSheets = (nodes: TreeNode[]): number =>
  nodes.reduce(
    (acc, n) => acc + (n.type === "sheet" ? 1 : countSheets(n.children)),
    0,
  );

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Lista plana de las filas visibles. Con `query`, solo se ven los elementos cuyo
 * nombre coincide (sin distinguir mayúsculas ni tildes) y sus carpetas contenedoras,
 * todas desplegadas.
 */
export const flatten = (
  nodes: TreeNode[],
  expanded: ReadonlySet<string>,
  query = "",
): Row[] => {
  const q = normalize(query.trim());
  const rows: Row[] = [];

  const matches = (n: TreeNode): boolean => {
    if (!q) {
      return true;
    }
    if (normalize(n.name).includes(q)) {
      return true;
    }
    return n.type === "folder" && n.children.some(matches);
  };

  const walk = (list: TreeNode[], depth: number) => {
    for (const n of list) {
      if (!matches(n)) {
        continue;
      }
      rows.push({ node: n, depth });
      if (n.type === "folder" && (q ? true : expanded.has(n.path))) {
        walk(n.children, depth + 1);
      }
    }
  };
  walk(nodes, 0);
  return rows;
};

// ---------------------------------------------------------------------------
// Selección múltiple
// ---------------------------------------------------------------------------
export type Selection = {
  selected: ReadonlySet<string>;
  anchor: string | null;
};

export const emptySelection: Selection = {
  selected: new Set(),
  anchor: null,
};

/**
 * Clic normal: selecciona solo ese. Ctrl/Cmd: agrega o quita. Shift: rango desde el
 * ancla hasta el clic, en el orden visible (con Ctrl+Shift se suma a lo ya elegido).
 */
export const applyClick = (
  sel: Selection,
  rows: Row[],
  path: string,
  mods: { ctrl: boolean; shift: boolean },
): Selection => {
  if (mods.shift) {
    const anchor = sel.anchor ?? path;
    const a = rows.findIndex((r) => r.node.path === anchor);
    const b = rows.findIndex((r) => r.node.path === path);
    if (a === -1 || b === -1) {
      return { selected: new Set([path]), anchor: path };
    }
    const [from, to] = a < b ? [a, b] : [b, a];
    const range = rows.slice(from, to + 1).map((r) => r.node.path);
    const next = new Set(mods.ctrl ? sel.selected : []);
    range.forEach((p) => next.add(p));
    return { selected: next, anchor }; // el ancla no se mueve
  }
  if (mods.ctrl) {
    const next = new Set(sel.selected);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    return { selected: next, anchor: path };
  }
  return { selected: new Set([path]), anchor: path };
};

/** Quita de la selección lo que ya no existe (tras borrar, mover o recargar). */
export const pruneSelection = (
  sel: Selection,
  index: Map<string, TreeNode>,
): Selection => {
  const next = new Set([...sel.selected].filter((p) => index.has(p)));
  if (
    next.size === sel.selected.size &&
    (!sel.anchor || index.has(sel.anchor))
  ) {
    return sel;
  }
  return {
    selected: next,
    anchor: sel.anchor && index.has(sel.anchor) ? sel.anchor : null,
  };
};

/** Descarta los elementos cuyo ancestro también está en la lista (mover/borrar la carpeta ya los incluye). */
export const topLevelOnly = (paths: Iterable<string>): string[] => {
  const all = [...new Set(paths)];
  return all.filter(
    (p) => !all.some((other) => other !== p && isSameOrInside(other, p)),
  );
};

// ---------------------------------------------------------------------------
// Mover
// ---------------------------------------------------------------------------
export type MoveCheck =
  | { ok: true; movable: string[] }
  | { ok: false; reason: string };

/**
 * ¿Se pueden mover `paths` a la carpeta `dest` ("" = raíz)?
 * - El destino debe existir y ser carpeta.
 * - Una carpeta no puede ir dentro de sí misma ni de sus descendientes.
 * - Lo que ya está en `dest` se ignora (no-op).
 */
export const validateMove = (
  paths: Iterable<string>,
  dest: string,
  index: Map<string, TreeNode>,
): MoveCheck => {
  if (dest !== "") {
    const target = index.get(dest);
    if (!target || target.type !== "folder") {
      return { ok: false, reason: "El destino no es una carpeta." };
    }
  }
  const top = topLevelOnly(paths).filter((p) => index.has(p));
  if (!top.length) {
    return { ok: false, reason: "No hay nada para mover." };
  }
  for (const p of top) {
    const node = index.get(p)!;
    if (node.type === "folder" && isSameOrInside(p, dest)) {
      return {
        ok: false,
        reason: "No se puede mover una carpeta dentro de sí misma.",
      };
    }
  }
  const movable = top.filter((p) => parentOf(p) !== dest);
  if (!movable.length) {
    return { ok: false, reason: "Ya está en esa carpeta." };
  }
  return { ok: true, movable };
};

/** Carpetas a las que se puede mover la selección (para el diálogo "Mover a…"). */
export const validDestinations = (
  paths: Iterable<string>,
  nodes: TreeNode[],
  index: Map<string, TreeNode>,
): { path: string; name: string; depth: number }[] => {
  const result: { path: string; name: string; depth: number }[] = [];
  if (validateMove(paths, "", index).ok) {
    result.push({ path: "", name: "Raíz", depth: 0 });
  }
  const walk = (list: TreeNode[], depth: number) => {
    for (const n of list) {
      if (n.type !== "folder") {
        continue;
      }
      if (validateMove(paths, n.path, index).ok) {
        result.push({ path: n.path, name: n.name, depth });
      }
      walk(n.children, depth + 1);
    }
  };
  walk(nodes, 1);
  return result;
};

/** Dónde crear algo nuevo según lo seleccionado: dentro de la carpeta elegida, o junto a la hoja elegida. */
export const newItemParent = (
  sel: Selection,
  index: Map<string, TreeNode>,
): string => {
  if (sel.selected.size !== 1) {
    return "";
  }
  const [only] = sel.selected;
  const node = index.get(only);
  if (!node) {
    return "";
  }
  return node.type === "folder" ? node.path : parentOf(node.path);
};

// ---------------------------------------------------------------------------
// Papelera
// ---------------------------------------------------------------------------
export const trashDaysLeft = (entry: TrashEntry, now: number): number =>
  Math.max(
    0,
    Math.ceil((entry.deletedAt + TRASH_DAYS * DAY_MS - now) / DAY_MS),
  );

// ---------------------------------------------------------------------------
// Ruta activa tras cambios
// ---------------------------------------------------------------------------
/** Si `current` está dentro de `from`, devuelve su ruta bajo `to`; si no, la misma. */
export const remapPath = (current: string, from: string, to: string): string =>
  isSameOrInside(from, current) ? to + current.slice(from.length) : current;
