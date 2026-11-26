import type {
  Result,
  SheetVersion,
  WriteResult,
} from "../../../desktop/src/api";

/** Lo mínimo que la sesión necesita del espacio de trabajo (se inyecta para poder probarla). */
export type SheetIO = {
  readSheet: (
    path: string,
  ) => Promise<Result<{ content: string; version: SheetVersion }>>;
  writeSheet: (
    path: string,
    content: string,
    expected: SheetVersion | null,
    force?: boolean,
  ) => Promise<Result<WriteResult>>;
  createSheet: (
    parent: string,
    name: string,
  ) => Promise<Result<{ path: string; version: SheetVersion }>>;
  setLastSheet: (path: string | null) => Promise<Result<null>>;
};

export type SheetSessionEvents = {
  /** El archivo cambió fuera de la app: tu versión se guardó en `copyPath`. */
  onConflict: (info: { originalPath: string; copyPath: string }) => void;
  /** Falló un guardado (disco lleno, sin permisos…). Se reintenta en el próximo cambio. */
  onError: (message: string) => void;
};

export type SheetSessionOptions = {
  debounceMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
};

const dirOf = (p: string) => p.split("/").slice(0, -1).join("/");
const stemOf = (p: string) =>
  (p.split("/").pop() ?? p).replace(/\.excalidraw$/i, "");

/**
 * Mantiene la hoja abierta y la guarda en disco: autosave con retraso, una
 * escritura a la vez, y sin pisar cambios externos (si el archivo cambió, tu
 * versión se guarda en una copia).
 */
export class SheetSession {
  private path: string | null = null;
  private version: SheetVersion | null = null;
  private lastSavedContent: string | null = null;
  private produce: (() => string) | null = null;
  private timer: unknown = null;
  private inFlight: Promise<void> | null = null;
  /** Mientras una operación estructural (mover, borrar…) corre no se programan guardados. */
  private paused = false;
  private listeners = new Set<() => void>();

  private readonly debounceMs: number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (id: unknown) => void;

  constructor(
    private io: SheetIO,
    private events: SheetSessionEvents,
    opts: SheetSessionOptions = {},
  ) {
    this.debounceMs = opts.debounceMs ?? 1500;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer =
      opts.clearTimer ??
      ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  }

  get currentPath() {
    return this.path;
  }

  /** Avisa cuando cambia la hoja abierta (abrir, renombrar/mover, desvincular, copia de conflicto). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  /** Marca una hoja como abierta (con el contenido y versión que se leyeron). */
  open(
    path: string,
    content: string,
    version: SheetVersion,
    /** Texto equivalente a "sin cambios" (si difiere solo en formato del archivo). */
    baseline: string = content,
  ) {
    this.cancelTimer();
    this.produce = null;
    this.path = path;
    this.version = version;
    this.lastSavedContent = baseline;
    void this.io.setLastSheet(path);
    this.emit();
  }

  /**
   * Avisa que la escena cambió. `produce` arma el texto a guardar; se llama solo
   * cuando toca guardar (no en cada cambio), por eso es una función.
   */
  notifyChange(produce: () => string) {
    if (!this.path) {
      return;
    }
    this.produce = produce;
    if (!this.paused) {
      this.schedule();
    }
  }

  private schedule() {
    this.cancelTimer();
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.save();
    }, this.debounceMs);
  }

  /**
   * Corre `fn` (p. ej. renombrar/mover/borrar archivos) con lo pendiente ya guardado
   * y sin que se programen escrituras mientras tanto; al terminar, retoma.
   */
  async withPaused<T>(fn: () => Promise<T>): Promise<T> {
    await this.flush();
    this.paused = true;
    try {
      return await fn();
    } finally {
      this.paused = false;
      if (this.path && this.produce) {
        this.schedule();
      }
    }
  }

  /** Si la hoja abierta cambió de ruta (renombrada o movida con su carpeta), la sigue. */
  remapPath(from: string, to: string) {
    if (!this.path) {
      return;
    }
    const next =
      this.path === from || this.path.startsWith(`${from}/`)
        ? to + this.path.slice(from.length)
        : this.path;
    if (next !== this.path) {
      this.path = next;
      void this.io.setLastSheet(next);
      this.emit();
    }
  }

  /** ¿La hoja abierta es `path` o está dentro de él? */
  isActiveWithin(path: string): boolean {
    return (
      !!this.path && (this.path === path || this.path.startsWith(`${path}/`))
    );
  }

  /** Deja de seguir la hoja actual (p. ej. se mandó a la papelera). Descarta lo pendiente. */
  detach() {
    this.cancelTimer();
    this.produce = null;
    this.path = null;
    this.version = null;
    this.lastSavedContent = null;
    this.emit();
  }

  /** Guarda ya lo pendiente (y espera a que termine). Para cierre de ventana y cambio de hoja. */
  async flush(): Promise<void> {
    this.cancelTimer();
    await this.save();
  }

  private cancelTimer() {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  /** Una sola escritura a la vez: si llega otra mientras tanto, se encadena. */
  private save(): Promise<void> {
    const run = async () => {
      if (this.inFlight) {
        await this.inFlight.catch(() => {});
      }
      await this.writeNow();
    };
    const p = run();
    const tracked = p.finally(() => {
      if (this.inFlight === tracked) {
        this.inFlight = null;
      }
    });
    this.inFlight = tracked;
    return tracked;
  }

  private async writeNow() {
    const path = this.path;
    const produce = this.produce;
    if (!path || !produce) {
      return;
    }
    const content = produce();
    if (content === this.lastSavedContent) {
      this.produce = null;
      return; // nada cambió en lo que se guarda (p. ej. solo scroll o selección)
    }

    const res = await this.io.writeSheet(path, content, this.version);
    if (!res.ok) {
      this.events.onError(res.error.message);
      return; // `produce` queda pendiente: se reintenta con el próximo cambio o flush
    }
    if (res.value.ok) {
      if (this.produce === produce) {
        this.produce = null;
      }
      this.version = res.value.version;
      this.lastSavedContent = content;
      return;
    }
    await this.saveAsConflictCopy(path, content);
  }

  /** El archivo cambió afuera: tu versión va a una copia y la sesión sigue ahí. */
  private async saveAsConflictCopy(path: string, content: string) {
    const created = await this.io.createSheet(
      dirOf(path),
      `${stemOf(path)} (copia de conflicto)`,
    );
    if (!created.ok) {
      this.events.onError(created.error.message);
      return;
    }
    const written = await this.io.writeSheet(
      created.value.path,
      content,
      created.value.version,
    );
    if (!written.ok || !written.value.ok) {
      this.events.onError("No se pudo guardar la copia de conflicto.");
      return;
    }
    this.path = created.value.path;
    this.version = written.value.version;
    this.lastSavedContent = content;
    this.produce = null;
    void this.io.setLastSheet(this.path);
    this.emit();
    this.events.onConflict({
      originalPath: path,
      copyPath: created.value.path,
    });
  }
}
