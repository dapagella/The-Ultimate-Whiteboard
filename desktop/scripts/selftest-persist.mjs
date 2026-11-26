// "Crear una hoja, dibujar, cerrar y volver a abrir: el dibujo sigue ahí." Sirve para el programa
// instalado (TUW_EXE="C:\ruta\The Ultimate Whiteboard.exe") o para electron + código fuente.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const exe = process.env.TUW_EXE;
const electronBin = exe ? null : (await import("electron")).default;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tuw-persist-"));
const ws = path.join(tmp, "ws");
fs.mkdirSync(path.join(ws, ".tuw"), { recursive: true });
fs.writeFileSync(
  path.join(ws, "Mi hoja.excalidraw"),
  JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "selftest",
    elements: [],
    appState: {},
    files: {},
  }),
);

const run = (extraEnv) =>
  new Promise((resolve) => {
    const p = spawn(exe || electronBin, exe ? [] : [desktopDir], {
      env: {
        ...process.env,
        TUW_SELFTEST: "1",
        TUW_USER_DATA: path.join(tmp, "userdata"),
        TUW_WORKSPACE_DIR: ws,
        ...extraEnv,
      },
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", () => {});
    const t = setTimeout(() => p.kill(), 120000);
    p.on("close", () => {
      clearTimeout(t);
      const line = out
        .split("\n")
        .find((l) => l.startsWith("TUW_SELFTEST_RESULT "));
      resolve(line ? JSON.parse(line.slice(20)) : null);
    });
  });

const sheet = () =>
  JSON.parse(fs.readFileSync(path.join(ws, "Mi hoja.excalidraw"), "utf8"));

// 1) dibuja un rectángulo y cierra la ventana enseguida (debe guardar igual)
await run({ TUW_SELFTEST_DRAW: "1", TUW_SELFTEST_CLOSE: "1" });
const afterFirst = sheet().elements.filter((e) => !e.isDeleted).length;

// 2) vuelve a abrir: la hoja se carga con lo dibujado
const second = await run({
  TUW_SELFTEST_SCRIPT: path.join(desktopDir, "selftest", "persist.e2e.js"),
});
fs.rmSync(tmp, { recursive: true, force: true });

const checks = {
  guardoAlCerrar: afterFirst >= 1,
  reabrioConElDibujo:
    second?.scriptResult?.steps?.persistencia?.hayElementos === true,
  sinErroresDeConsola: (second?.consoleErrors?.length ?? 1) === 0,
};
console.log(JSON.stringify(checks, null, 2));
const bad = Object.entries(checks).filter(([, v]) => v !== true);
if (bad.length) {
  console.error(`FALLÓ: ${bad.map(([k]) => k).join(", ")}`);
  process.exit(1);
}
console.log("OK: la hoja persiste tras cerrar y volver a abrir.");
