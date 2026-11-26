// Prueba de interfaz de punta a punta en la app real (Electron):
//   yarn desktop:build && yarn desktop:selftest
// Crea un espacio de trabajo temporal de 300 hojas en 30 carpetas, abre la app compilada,
// ejecuta desktop/selftest/explorer.e2e.js dentro de la ventana y falla si algo no se cumple.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, "..");
const electronBin = (await import("electron")).default;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tuw-selftest-"));
const ws = path.join(tmp, "ws");
fs.mkdirSync(path.join(ws, ".tuw"), { recursive: true });
const doc = JSON.stringify({
  type: "excalidraw",
  version: 2,
  source: "selftest",
  elements: [],
  appState: {},
  files: {},
});
for (let f = 0; f < 30; f++) {
  const dir = path.join(ws, `F${String(f).padStart(2, "0")}`);
  fs.mkdirSync(dir);
  for (let s = 0; s < 10; s++) {
    fs.writeFileSync(
      path.join(dir, `H${String(s).padStart(2, "0")}.excalidraw`),
      doc,
    );
  }
}

const res = spawnSync(electronBin, [desktopDir], {
  encoding: "utf8",
  timeout: 180000,
  env: {
    ...process.env,
    TUW_SELFTEST: "1",
    TUW_USER_DATA: path.join(tmp, "userdata"),
    TUW_WORKSPACE_DIR: ws,
    TUW_SELFTEST_SCRIPT: path.join(desktopDir, "selftest", "explorer.e2e.js"),
  },
});

const line = (res.stdout || "")
  .split("\n")
  .find((l) => l.startsWith("TUW_SELFTEST_RESULT "));
if (!line) {
  process.stderr.write(
    "No hubo resultado del autotest.\n",
    res.stdout,
    res.stderr,
  );
  process.exit(1);
}
const result = JSON.parse(line.slice("TUW_SELFTEST_RESULT ".length));
const problems = [];

if (result.consoleErrors?.length) {
  problems.push(`errores de consola: ${result.consoleErrors.length}`);
}
const script = result.scriptResult;
if (!script || script.error) {
  problems.push(`el guion falló: ${script?.error}`);
} else {
  for (const [name, value] of Object.entries(script.steps)) {
    if (typeof value === "string") {
      problems.push(`${name}: ${value}`);
      continue;
    }
    for (const [k, v] of Object.entries(value)) {
      if (v === false) {
        problems.push(`${name}.${k} = false`);
      }
      if (k === "error" && v) {
        problems.push(`${name}.error = ${v}`);
      }
    }
  }
  const { abrirPanel, render330Filas } = script.steps;
  if (abrirPanel?.ms >= 1000) {
    problems.push(`el panel tardó ${abrirPanel.ms} ms en abrir (límite 1000)`);
  }
  if (render330Filas?.filas !== 330) {
    problems.push(`se esperaban 330 filas y hubo ${render330Filas?.filas}`);
  }
  if (script.errorEnPanel) {
    problems.push(`error mostrado en el panel: ${script.errorEnPanel}`);
  }
}

process.stdout.write(JSON.stringify(script?.steps ?? script, null, 2));
fs.rmSync(tmp, { recursive: true, force: true });
if (problems.length) {
  process.stderr.write(`\nFALLÓ:\n - ${problems.join("\n - ")}`);
  process.exit(1);
}
process.stdout.write(
  "\nOK: la interfaz del explorador funciona en la app real.",
);
