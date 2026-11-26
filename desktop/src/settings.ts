/**
 * Ajustes del programa (NO del espacio de trabajo): última carpeta y última hoja abiertas.
 * Se guardan en `userData/settings.json`. Sin dependencias de Electron (testeable).
 */
import fs from "node:fs/promises";
import path from "node:path";

export type AppSettings = {
  workspaceRoot?: string;
  /** Última hoja abierta, de la raíz `workspaceRoot` (ruta relativa). */
  lastSheet?: string | null;
};

export const WORKSPACE_FOLDER_NAME = "The Ultimate Whiteboard";

export const readSettings = async (file: string): Promise<AppSettings> => {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    if (parsed && typeof parsed === "object") {
      return {
        workspaceRoot:
          typeof parsed.workspaceRoot === "string"
            ? parsed.workspaceRoot
            : undefined,
        lastSheet:
          typeof parsed.lastSheet === "string" ? parsed.lastSheet : null,
      };
    }
  } catch {
    // no existe o está dañado: se parte de cero
  }
  return {};
};

export const writeSettings = async (file: string, settings: AppSettings) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(settings, null, 2), "utf8");
  await fs.rename(tmp, file);
};

/**
 * Dada la carpeta que eligió el usuario, decide cuál es la raíz del espacio de trabajo.
 * Para no mezclar con archivos ajenos (p. ej. si elige "Documentos"), se crea una
 * subcarpeta "The Ultimate Whiteboard", salvo que la elegida ya sea un espacio de
 * trabajo (tiene `.tuw`), se llame así, o esté vacía.
 */
export const resolveWorkspaceRoot = async (chosen: string): Promise<string> => {
  const abs = path.resolve(chosen);
  if (
    path.basename(abs).toLowerCase() === WORKSPACE_FOLDER_NAME.toLowerCase()
  ) {
    return abs;
  }
  try {
    const entries = await fs.readdir(abs);
    if (entries.length === 0 || entries.includes(".tuw")) {
      return abs;
    }
  } catch {
    // no existe todavía: se crea tal cual
    return abs;
  }
  return path.join(abs, WORKSPACE_FOLDER_NAME);
};
