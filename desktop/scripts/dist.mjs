// Genera el instalador de Windows con electron-builder.
//   node desktop/scripts/dist.mjs            → compila y crea el instalador en desktop/release (sin publicar)
//   node desktop/scripts/dist.mjs --publish  → además lo sube a GitHub Releases (necesita GH_TOKEN; lo usa el workflow)
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, "..");
const publish = process.argv.includes("--publish");

const run = (cmd, args, cwd) => {
  const res = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
};

run("node", [path.join(here, "build.mjs")], desktopDir);
// se llama a electron-builder con node directamente (el atajo de `npx` falla en el runner de Windows)
const builderCli = createRequire(import.meta.url).resolve(
  "electron-builder/cli.js",
);
run(
  process.execPath,
  [
    builderCli,
    "--config",
    "electron-builder.yml",
    "--win",
    "nsis",
    "--x64",
    "--publish",
    publish ? "always" : "never",
  ],
  desktopDir,
);
