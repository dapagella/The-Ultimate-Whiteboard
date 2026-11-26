// Modo desarrollo: levanta Vite (recarga en vivo) y abre Electron apuntando a él.
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildMain } from "./build.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const PORT = 3001;

const waitForPort = (port, timeoutMs = 120000) =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const tryOnce = () => {
      const socket = net.connect({ port, host: "localhost" });
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Vite no levantó en el puerto ${port}`));
        } else {
          setTimeout(tryOnce, 500);
        }
      });
    };
    tryOnce();
  });

await buildMain();

const vite = spawn(
  "yarn",
  [
    "--cwd",
    path.join(rootDir, "excalidraw-app"),
    "vite",
    "--port",
    String(PORT),
  ],
  {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, VITE_TUW_DESKTOP: "true" },
  },
);

let viteKilled = false;
const killVite = () => {
  if (viteKilled) {
    return;
  }
  viteKilled = true;
  if (process.platform === "win32") {
    // síncrono: en el evento "exit" no se pueden esperar procesos asíncronos
    spawnSync("taskkill", ["/pid", String(vite.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    vite.kill();
  }
};
process.on("exit", killVite);

await waitForPort(PORT);

const electronBin = (await import("electron")).default;
const electron = spawn(electronBin, [path.join(rootDir, "desktop")], {
  stdio: "inherit",
  env: { ...process.env, TUW_DEV_URL: `http://localhost:${PORT}` },
});
electron.on("exit", (code) => {
  killVite();
  process.exit(code ?? 0);
});
