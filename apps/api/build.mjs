import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, rm } from "node:fs/promises";
import { build } from "esbuild";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outdir = path.resolve(dir, "dist");

const pkg = JSON.parse(await readFile(path.resolve(dir, "package.json"), "utf8"));
const external = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(
  (name) => !name.startsWith("@namma-seva/"),
);

await rm(outdir, { recursive: true, force: true });
await build({
  entryPoints: [path.resolve(dir, "src/index.ts")],
  platform: "node",
  target: "node20",
  bundle: true,
  format: "esm",
  outdir,
  outExtension: { ".js": ".mjs" },
  sourcemap: "linked",
  logLevel: "info",
  // Bundle workspace packages (they ship TS source); keep npm deps external — pino spawns
  // transport workers by file path and cannot be bundled.
  external,
});
