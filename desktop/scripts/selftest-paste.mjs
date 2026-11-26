// Ctrl+V real de una imagen del portapapeles en la app Electron (como un recorte de pantalla).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const electronBin = (await import("electron")).default;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tuw-paste-"));
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

// PNG 80x50 rojo, generado a mano
const crcT = [...Array(256)].map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (t, d) => {
  const l = Buffer.alloc(4);
  l.writeUInt32BE(d.length);
  const td = Buffer.concat([Buffer.from(t), d]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([l, td, c]);
};
const W = 80,
  H = 50;
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const raw = Buffer.concat(
  [...Array(H)].map(() =>
    Buffer.concat([
      Buffer.from([0]),
      Buffer.from([...Array(W)].flatMap(() => [220, 30, 30])),
    ]),
  ),
);
const png = path.join(tmp, "recorte.png");
fs.writeFileSync(
  png,
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);

const out = await new Promise((resolve) => {
  const p = spawn(electronBin, [desktopDir], {
    env: {
      ...process.env,
      TUW_SELFTEST: "1",
      TUW_USER_DATA: path.join(tmp, "ud"),
      TUW_WORKSPACE_DIR: ws,
      TUW_SELFTEST_PASTE_PNG: "1",
      TUW_SELFTEST_SCRIPT: path.join(desktopDir, "selftest", "paste.e2e.js"),
    },
  });
  let so = "";
  p.stdout.on("data", (d) => (so += d));
  p.stderr.on("data", () => {});
  const t = setTimeout(() => p.kill(), 120000);
  p.on("close", () => {
    clearTimeout(t);
    resolve(so);
  });
});
const line = out.split("\n").find((l) => l.startsWith("TUW_SELFTEST_RESULT "));
const r = line && JSON.parse(line.slice(20)).scriptResult;
console.log(JSON.stringify(r, null, 2));
fs.rmSync(tmp, { recursive: true, force: true });
const bad =
  !r?.steps ||
  Object.entries(r.steps.pegado).some(([k, v]) => k !== "medida" && v !== true);
console.log(
  bad
    ? "FALLÓ"
    : "OK: Ctrl+V real pega la imagen del portapapeles y queda guardada en la hoja.",
);
process.exit(bad ? 1 : 0);
