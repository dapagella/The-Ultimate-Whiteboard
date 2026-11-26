// Ejecuta UN guion de desktop/selftest/<nombre>.e2e.js dentro de la app Electron real, con una hoja vacía.
//   yarn desktop:build && node desktop/scripts/selftest-run.mjs pen
// El guion devuelve { steps: { grupo: { chequeo: true|false|valor } } }; falla si algún chequeo no es true
// (los chequeos cuyo nombre empieza con "_" son solo informativos).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const name = process.argv[2];
if (!name) {
  console.error("Uso: node desktop/scripts/selftest-run.mjs <nombre>");
  process.exit(2);
}
const desktopDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const electronBin = (await import("electron")).default;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `tuw-${name}-`));
const ws = path.join(tmp, "ws");
fs.mkdirSync(path.join(ws, ".tuw"), { recursive: true });
fs.writeFileSync(
  path.join(ws, "Hoja.excalidraw"),
  JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "selftest",
    elements: [],
    appState: {},
    files: {},
  }),
);

const out = await new Promise((resolve) => {
  const p = spawn(electronBin, [desktopDir], {
    env: {
      ...process.env,
      TUW_SELFTEST: "1",
      TUW_USER_DATA: path.join(tmp, "userdata"),
      TUW_WORKSPACE_DIR: ws,
      TUW_SELFTEST_SCRIPT: path.join(desktopDir, "selftest", `${name}.e2e.js`),
    },
  });
  let so = "";
  p.stdout.on("data", (d) => (so += d));
  p.stderr.on("data", () => {});
  const t = setTimeout(() => p.kill(), 180000);
  p.on("close", () => {
    clearTimeout(t);
    resolve(so);
  });
});
fs.rmSync(tmp, { recursive: true, force: true });

const line = out.split("\n").find((l) => l.startsWith("TUW_SELFTEST_RESULT "));
if (!line) {
  console.error(`No hubo resultado del autotest.\n${out.slice(0, 1500)}`);
  process.exit(1);
}
const result = JSON.parse(line.slice("TUW_SELFTEST_RESULT ".length));
const s = result.scriptResult;
const problems = [];
if (result.consoleErrors?.length) {
  problems.push(`errores de consola: ${JSON.stringify(result.consoleErrors)}`);
}
if (!s || s.error) {
  problems.push(`el guion falló: ${s?.error}`);
} else {
  for (const [group, checks] of Object.entries(s.steps)) {
    for (const [k, v] of Object.entries(checks)) {
      if (!k.startsWith("_") && v !== true) {
        problems.push(`${group}.${k} = ${JSON.stringify(v)}`);
      }
    }
  }
}
console.log(JSON.stringify(s, null, 2));
if (problems.length) {
  console.error(`\nFALLÓ:\n - ${problems.join("\n - ")}`);
  process.exit(1);
}
console.log(`\nOK: ${name}`);
