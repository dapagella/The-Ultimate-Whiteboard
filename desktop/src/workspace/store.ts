/**
 * Almacén del espacio de trabajo: carpetas = directorios, hojas = archivos .excalidraw.
 * Solo corre en el proceso principal. Todas las rutas que recibe son RELATIVAS a la raíz.
 */
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  INTERNAL_DIR,
  SHEET_EXT,
  WorkspaceError,
  assertValidName,
  baseName,
  isSameOrInside,
  isSheetFile,
  joinRel,
  parentRel,
  resolveInWorkspace,
  sheetDisplayName,
  splitRelPath,
  uniqueName,
} from "./paths";

import type { SheetVersion, TrashEntry, TreeNode, WriteResult } from "./types";

export type { SheetVersion, TrashEntry, TreeNode, WriteResult };

export const TRASH_RETENTION_MS = 15 * 24 * 60 * 60 * 1000;
const BACKUP_MIN_INTERVAL_MS = 5 * 60 * 1000;
const TRASH_ID_RE = /^\d+-[a-f0-9]{8}$/;
const FORMAT_VERSION = 1;

const collator = new Intl.Collator("es", {
  numeric: true,
  sensitivity: "base",
});
const byName = (a: { name: string }, b: { name: string }) =>
  collator.compare(a.name, b.name);

const sha256 = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");

const isNotFound = (e: any) => e?.code === "ENOENT" || e?.code === "ENOTDIR";

export class WorkspaceStore {
  readonly root: string;
  private now: () => number;
  private lastBackupAt = new Map<string, number>();

  constructor(rootDir: string, opts: { now?: () => number } = {}) {
    this.root = path.resolve(rootDir);
    this.now = opts.now ?? Date.now;
  }

  // -------------------------------------------------------------------------
  // Inicio
  // -------------------------------------------------------------------------
  async init() {
    await fs.mkdir(this.internal("trash"), { recursive: true });
    await fs.mkdir(this.internal("bak"), { recursive: true });
    const meta = this.internal("workspace.json");
    try {
      await fs.access(meta);
    } catch {
      await fs.writeFile(
        meta,
        JSON.stringify(
          { formatVersion: FORMAT_VERSION, createdAt: this.now() },
          null,
          2,
        ),
      );
    }
  }

  private internal(...parts: string[]) {
    return path.join(this.root, INTERNAL_DIR, ...parts);
  }

  /**
   * Ruta absoluta de `rel`, validada: dentro de la raíz Y sin escapar por
   * enlaces simbólicos (se resuelve el ancestro existente más cercano).
   */
  private async safeAbs(rel: string): Promise<string> {
    const abs = resolveInWorkspace(this.root, rel);
    let realRoot: string;
    try {
      realRoot = await fs.realpath(this.root);
    } catch {
      return abs;
    }
    let probe = abs;
    for (;;) {
      try {
        const real = await fs.realpath(probe);
        if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
          throw new WorkspaceError(
            "OUTSIDE_WORKSPACE",
            "La ruta está fuera del espacio de trabajo.",
          );
        }
        return abs;
      } catch (e: any) {
        if (e instanceof WorkspaceError) {
          throw e;
        }
        const up = path.dirname(probe);
        if (up === probe) {
          return abs;
        }
        probe = up;
      }
    }
  }

  private async statOrNull(abs: string) {
    try {
      return await fs.lstat(abs);
    } catch (e) {
      if (isNotFound(e)) {
        return null;
      }
      throw e;
    }
  }

  private async assertDir(rel: string): Promise<string> {
    const abs = await this.safeAbs(rel);
    const st = await this.statOrNull(abs);
    if (!st || !st.isDirectory()) {
      throw new WorkspaceError("NOT_FOUND", "La carpeta no existe.");
    }
    return abs;
  }

  private async childNames(absDir: string): Promise<string[]> {
    return (await fs.readdir(absDir)).filter((n) => !n.startsWith("."));
  }

  // -------------------------------------------------------------------------
  // Árbol
  // -------------------------------------------------------------------------
  async list(): Promise<TreeNode[]> {
    return this.listDir("");
  }

  private async listDir(rel: string): Promise<TreeNode[]> {
    const abs = resolveInWorkspace(this.root, rel);
    const entries = await fs.readdir(abs, { withFileTypes: true });
    const folders: TreeNode[] = [];
    const sheets: TreeNode[] = [];
    for (const entry of entries) {
      // ocultos (incluye .tuw y .tmp de escrituras) y enlaces simbólicos: no se muestran
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) {
        continue;
      }
      const childRel = joinRel(rel, entry.name);
      if (entry.isDirectory()) {
        folders.push({
          type: "folder",
          name: entry.name,
          path: childRel,
          children: await this.listDir(childRel),
        });
      } else if (entry.isFile() && isSheetFile(entry.name)) {
        const st = await fs.stat(path.join(abs, entry.name));
        sheets.push({
          type: "sheet",
          name: sheetDisplayName(entry.name),
          path: childRel,
          mtimeMs: st.mtimeMs,
          size: st.size,
        });
      }
    }
    folders.sort(byName);
    sheets.sort(byName);
    return [...folders, ...sheets];
  }

  // -------------------------------------------------------------------------
  // Carpetas y hojas
  // -------------------------------------------------------------------------
  async createFolder(parent: string, name: string): Promise<string> {
    const clean = assertValidName(name);
    const absParent = await this.assertDir(parent);
    const names = await this.childNames(absParent);
    if (names.some((n) => n.toLowerCase() === clean.toLowerCase())) {
      throw new WorkspaceError("EXISTS", `Ya existe "${clean}".`);
    }
    const rel = joinRel(parent, clean);
    await fs.mkdir(await this.safeAbs(rel));
    return rel;
  }

  /** Crea una hoja; si el nombre está ocupado agrega " (2)", " (3)"… */
  async createSheet(
    parent: string,
    name: string,
    content = defaultSheetContent(),
  ): Promise<{ path: string; version: SheetVersion }> {
    const clean = assertValidName(name);
    const absParent = await this.assertDir(parent);
    const fileName = uniqueName(
      await this.childNames(absParent),
      clean,
      SHEET_EXT,
    );
    const rel = joinRel(parent, fileName);
    const res = await this.writeSheet(rel, content, null);
    if (!res.ok) {
      throw new WorkspaceError("CONFLICT", "La hoja ya existe.");
    }
    return { path: rel, version: res.version };
  }

  async rename(rel: string, newName: string): Promise<string> {
    const segs = splitRelPath(rel);
    if (!segs.length) {
      throw new WorkspaceError(
        "INVALID_OPERATION",
        "No se puede renombrar la raíz.",
      );
    }
    const clean = assertValidName(newName);
    const abs = await this.safeAbs(rel);
    const st = await this.statOrNull(abs);
    if (!st) {
      throw new WorkspaceError("NOT_FOUND", "No existe.");
    }
    const isSheet = st.isFile();
    const newFile = isSheet ? clean + SHEET_EXT : clean;
    const parent = parentRel(rel);
    const absParent = path.dirname(abs);
    const taken = (await this.childNames(absParent)).filter(
      (n) => n.toLowerCase() !== baseName(rel).toLowerCase(),
    );
    if (taken.some((n) => n.toLowerCase() === newFile.toLowerCase())) {
      throw new WorkspaceError("EXISTS", `Ya existe "${clean}".`);
    }
    const newRel = joinRel(parent, newFile);
    await fs.rename(abs, await this.safeAbs(newRel));
    return newRel;
  }

  /**
   * Mueve una carpeta u hoja a otra carpeta. Si el destino ya tiene un
   * elemento con ese nombre, el movido recibe " (2)". Devuelve la nueva ruta.
   */
  async move(rel: string, destFolder: string): Promise<string> {
    const segs = splitRelPath(rel);
    if (!segs.length) {
      throw new WorkspaceError(
        "INVALID_OPERATION",
        "No se puede mover la raíz.",
      );
    }
    if (isSameOrInside(rel, destFolder)) {
      throw new WorkspaceError(
        "INVALID_OPERATION",
        "No se puede mover una carpeta dentro de sí misma.",
      );
    }
    const abs = await this.safeAbs(rel);
    const st = await this.statOrNull(abs);
    if (!st) {
      throw new WorkspaceError("NOT_FOUND", "No existe.");
    }
    const absDest = await this.assertDir(destFolder);
    if (parentRel(rel) === destFolder) {
      return rel;
    }
    const isSheet = st.isFile();
    const base = isSheet ? sheetDisplayName(baseName(rel)) : baseName(rel);
    const finalName = uniqueName(
      await this.childNames(absDest),
      base,
      isSheet ? SHEET_EXT : "",
    );
    const newRel = joinRel(destFolder, finalName);
    await fs.rename(abs, await this.safeAbs(newRel));
    return newRel;
  }

  async duplicateSheet(
    rel: string,
  ): Promise<{ path: string; version: SheetVersion }> {
    const { content } = await this.readSheet(rel);
    const name = sheetDisplayName(baseName(rel));
    return this.createSheet(parentRel(rel), `${name} (copia)`, content);
  }

  // -------------------------------------------------------------------------
  // Contenido de hojas
  // -------------------------------------------------------------------------
  private async versionOf(
    abs: string,
    content?: string | Buffer,
  ): Promise<SheetVersion> {
    const st = await fs.stat(abs);
    const hash = sha256(content ?? (await fs.readFile(abs)));
    return { mtimeMs: st.mtimeMs, size: st.size, hash };
  }

  async readSheet(
    rel: string,
  ): Promise<{ content: string; version: SheetVersion }> {
    if (!isSheetFile(baseName(rel))) {
      throw new WorkspaceError("INVALID_PATH", "No es una hoja.");
    }
    const abs = await this.safeAbs(rel);
    let buf: Buffer;
    try {
      buf = await fs.readFile(abs);
    } catch (e) {
      if (isNotFound(e)) {
        throw new WorkspaceError("NOT_FOUND", "La hoja no existe.");
      }
      throw e;
    }
    const st = await fs.stat(abs);
    return {
      content: buf.toString("utf8"),
      version: { mtimeMs: st.mtimeMs, size: st.size, hash: sha256(buf) },
    };
  }

  /**
   * Guarda una hoja de forma ATÓMICA (archivo temporal + rename) y con control
   * de cambios externos:
   * - `expected` = versión leída/guardada por última vez (null = hoja nueva).
   * - Si el archivo en disco cambió desde entonces → `{ ok:false, conflict:true }`
   *   y NO se escribe, salvo `opts.force`.
   */
  async writeSheet(
    rel: string,
    content: string,
    expected: SheetVersion | null,
    opts: { force?: boolean } = {},
  ): Promise<WriteResult> {
    if (!isSheetFile(baseName(rel))) {
      throw new WorkspaceError("INVALID_PATH", "No es una hoja.");
    }
    const abs = await this.safeAbs(rel);
    const st = await this.statOrNull(abs);
    if (st && !st.isFile()) {
      throw new WorkspaceError("INVALID_PATH", "No es una hoja.");
    }

    if (st && !opts.force) {
      let unchanged = false;
      if (expected) {
        if (st.mtimeMs === expected.mtimeMs && st.size === expected.size) {
          unchanged = true;
        } else {
          const current = await this.versionOf(abs);
          if (current.hash === expected.hash) {
            unchanged = true;
          } else {
            return { ok: false, conflict: true, current };
          }
        }
      }
      if (!unchanged) {
        // expected == null pero el archivo ya existe: alguien lo creó antes
        return {
          ok: false,
          conflict: true,
          current: await this.versionOf(abs),
        };
      }
    }

    if (st) {
      await this.backupIfDue(rel, abs);
    }

    const tmp = `${abs}.${randomUUID().slice(0, 8)}.tmp`;
    try {
      await fs.writeFile(tmp, content, "utf8");
      await fs.rename(tmp, abs);
    } catch (e) {
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw e;
    }
    return { ok: true, version: await this.versionOf(abs, content) };
  }

  /** Copia de seguridad de la versión anterior (máx. una cada 5 minutos por hoja). */
  private async backupIfDue(rel: string, abs: string) {
    const last = this.lastBackupAt.get(rel) ?? 0;
    if (this.now() - last < BACKUP_MIN_INTERVAL_MS) {
      return;
    }
    try {
      const name = `${rel.split("/").join("__")}.bak`;
      await fs.mkdir(this.internal("bak"), { recursive: true });
      await fs.copyFile(abs, this.internal("bak", name));
      this.lastBackupAt.set(rel, this.now());
    } catch {
      // el backup es "best effort": nunca debe impedir guardar
    }
  }

  // -------------------------------------------------------------------------
  // Papelera (15 días)
  // -------------------------------------------------------------------------
  async trash(rel: string): Promise<TrashEntry> {
    const segs = splitRelPath(rel);
    if (!segs.length) {
      throw new WorkspaceError(
        "INVALID_OPERATION",
        "No se puede borrar la raíz.",
      );
    }
    const abs = await this.safeAbs(rel);
    const st = await this.statOrNull(abs);
    if (!st) {
      throw new WorkspaceError("NOT_FOUND", "No existe.");
    }
    const fileName = baseName(rel);
    const entry: TrashEntry = {
      id: `${this.now()}-${randomUUID()
        .slice(0, 8)
        .replace(/[^a-f0-9]/g, "0")}`,
      type: st.isDirectory() ? "folder" : "sheet",
      name: st.isDirectory() ? fileName : sheetDisplayName(fileName),
      originalPath: rel,
      deletedAt: this.now(),
    };
    const dir = this.internal("trash", entry.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.rename(abs, path.join(dir, fileName));
    await fs.writeFile(
      path.join(dir, "manifest.json"),
      JSON.stringify(entry, null, 2),
    );
    return entry;
  }

  private trashDir(id: string) {
    if (typeof id !== "string" || !TRASH_ID_RE.test(id)) {
      throw new WorkspaceError(
        "INVALID_PATH",
        "Identificador de papelera inválido.",
      );
    }
    return this.internal("trash", id);
  }

  async listTrash(): Promise<TrashEntry[]> {
    let ids: string[];
    try {
      ids = await fs.readdir(this.internal("trash"));
    } catch {
      return [];
    }
    const entries: TrashEntry[] = [];
    for (const id of ids) {
      if (!TRASH_ID_RE.test(id)) {
        continue;
      }
      try {
        const raw = await fs.readFile(
          this.internal("trash", id, "manifest.json"),
          "utf8",
        );
        entries.push(JSON.parse(raw) as TrashEntry);
      } catch {
        // entrada incompleta: se ignora (la purga la limpiará)
      }
    }
    return entries.sort((a, b) => b.deletedAt - a.deletedAt);
  }

  /** Restaura a la ruta original; si su carpeta ya no existe, va a la raíz. Devuelve la ruta nueva. */
  async restoreTrash(id: string): Promise<string> {
    const dir = this.trashDir(id);
    let entry: TrashEntry;
    try {
      entry = JSON.parse(
        await fs.readFile(path.join(dir, "manifest.json"), "utf8"),
      );
    } catch {
      throw new WorkspaceError("NOT_FOUND", "No está en la papelera.");
    }
    const fileName = baseName(entry.originalPath);
    let destFolder = parentRel(entry.originalPath);
    try {
      await this.assertDir(destFolder);
    } catch {
      destFolder = "";
    }
    const absDest = await this.assertDir(destFolder);
    const isSheet = entry.type === "sheet";
    const finalName = uniqueName(
      await this.childNames(absDest),
      isSheet ? sheetDisplayName(fileName) : fileName,
      isSheet ? SHEET_EXT : "",
    );
    const newRel = joinRel(destFolder, finalName);
    await fs.rename(path.join(dir, fileName), await this.safeAbs(newRel));
    await fs.rm(dir, { recursive: true, force: true });
    return newRel;
  }

  async deleteTrashForever(id: string): Promise<void> {
    await fs.rm(this.trashDir(id), { recursive: true, force: true });
  }

  /** Borra definitivamente lo que lleva más de 15 días en la papelera. Devuelve cuántos. */
  async purgeTrash(maxAgeMs = TRASH_RETENTION_MS): Promise<number> {
    let ids: string[];
    try {
      ids = await fs.readdir(this.internal("trash"));
    } catch {
      return 0;
    }
    const limit = this.now() - maxAgeMs;
    let purged = 0;
    for (const id of ids) {
      if (!TRASH_ID_RE.test(id)) {
        continue;
      }
      // la antigüedad sale del id (timestamp), así también se limpian entradas sin manifiesto
      const deletedAt = Number(id.split("-")[0]);
      if (deletedAt < limit) {
        await fs.rm(this.internal("trash", id), {
          recursive: true,
          force: true,
        });
        purged++;
      }
    }
    return purged;
  }
}

/** Contenido de una hoja vacía (formato Excalidraw estándar). */
export const defaultSheetContent = () =>
  JSON.stringify(
    {
      type: "excalidraw",
      version: 2,
      source: "the-ultimate-whiteboard",
      elements: [],
      appState: {},
      files: {},
    },
    null,
    2,
  );
