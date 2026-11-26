// Compila la app de escritorio:
//   node desktop/scripts/build.mjs            → proceso principal + preload + app web
//   node desktop/scripts/build.mjs --main     → solo proceso principal y preload
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, "..");
const rootDir = path.resolve(desktopDir, "..");
const distDir = path.join(desktopDir, "dist");

export const buildMain = async () => {
  fs.mkdirSync(distDir, { recursive: true });
  await build({
    entryPoints: {
      main: path.join(desktopDir, "src/main.ts"),
      preload: path.join(desktopDir, "src/preload.ts"),
    },
    outdir: distDir,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    sourcemap: true,
    logLevel: "info",
  });
};

const buildWeb = () => {
  const res = spawnSync(
    "yarn",
    ["--cwd", path.join(rootDir, "excalidraw-app"), "vite", "build"],
    {
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        VITE_TUW_DESKTOP: "true",
        VITE_APP_ENABLE_TRACKING: "false",
      },
    },
  );
  if (res.status !== 0) {
    throw new Error("Falló el build de la app web");
  }
  const target = path.join(distDir, "app");
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(path.join(rootDir, "excalidraw-app", "build"), target, {
    recursive: true,
  });
};

// Ícono de la ventana a partir del logo (public/android-chrome-512x512.png).
const copyIcon = () => {
  const buildDir = path.join(desktopDir, "build");
  fs.mkdirSync(buildDir, { recursive: true });
  fs.copyFileSync(
    path.join(rootDir, "public", "android-chrome-512x512.png"),
    path.join(buildDir, "icon.png"),
  );
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  copyIcon();
  await buildMain();
  if (!process.argv.includes("--main")) {
    buildWeb();
  }
}
