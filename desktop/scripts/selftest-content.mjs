// Prueba de punta a punta de "imagen por URL" y "fórmulas" en la app real (Electron).
//   yarn desktop:build && node desktop/scripts/selftest-content.mjs
// Levanta un servidor local con casos de prueba (imagen válida, HTML disfrazado de imagen,
// redirección, archivo enorme) y ejecuta desktop/selftest/content.e2e.js dentro de la ventana.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, "..");
const electronBin = (await import("electron")).default;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const server = http.createServer((req, res) => {
  if (req.url === "/ok.png") {
    res.writeHead(200, { "content-type": "image/png" });
    res.end(PNG);
  } else if (req.url === "/fake.png") {
    res.writeHead(200, { "content-type": "image/png" });
    res.end("<html><body>no soy una imagen</body></html>");
  } else if (req.url === "/redir") {
    res.writeHead(302, { location: "/ok.png" });
    res.end();
  } else if (req.url === "/big") {
    res.writeHead(200, { "content-type": "image/png" });
    const chunk = Buffer.alloc(1024 * 1024, 0x89);
    let n = 0;
    const push = () => {
      while (n < 20) {
        n++;
        if (!res.write(chunk)) {
          res.once("drain", push);
          return;
        }
      }
      res.end();
    };
    push();
  } else {
    res.writeHead(404);
    res.end("no existe");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tuw-content-"));
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
const script = path.join(tmp, "content.e2e.js");
fs.writeFileSync(
  script,
  `const PORT = ${port};\n${fs.readFileSync(
    path.join(desktopDir, "selftest", "content.e2e.js"),
    "utf8",
  )}`,
);

// asíncrono a propósito: con spawnSync el servidor de prueba (este mismo proceso) no podría responder
const child = await new Promise((resolve) => {
  const p = spawn(electronBin, [desktopDir], {
    env: {
      ...process.env,
      TUW_SELFTEST: "1",
      TUW_USER_DATA: path.join(tmp, "userdata"),
      TUW_WORKSPACE_DIR: ws,
      TUW_SELFTEST_SCRIPT: script,
    },
  });
  let stdout = "";
  let stderr = "";
  p.stdout.on("data", (d) => (stdout += d));
  p.stderr.on("data", (d) => (stderr += d));
  const timer = setTimeout(() => p.kill(), 180000);
  p.on("close", () => {
    clearTimeout(timer);
    resolve({ stdout, stderr });
  });
});
server.close();

const line = (child.stdout || "")
  .split("\n")
  .find((l) => l.startsWith("TUW_SELFTEST_RESULT "));
if (!line) {
  process.stderr.write(
    `No hubo resultado del autotest.\n${child.stdout}\n${child.stderr}`,
  );
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
  for (const [name, group] of Object.entries(s.steps)) {
    for (const [k, v] of Object.entries(group)) {
      if (v !== true) {
        problems.push(`${name}.${k} = ${v}`);
      }
    }
  }
}
process.stdout.write(JSON.stringify(s, null, 2));
fs.rmSync(tmp, { recursive: true, force: true });
if (problems.length) {
  process.stderr.write(`\nFALLÓ:\n - ${problems.join("\n - ")}`);
  process.exit(1);
}
process.stdout.write(
  "\nOK: imagen por URL y fórmulas funcionan en la app real.",
);
