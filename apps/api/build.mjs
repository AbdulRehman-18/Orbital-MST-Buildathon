import path from "node:path";
import { fileURLToPath } from "node:url";
import { cp, readFile, rm } from "node:fs/promises";
import { build } from "esbuild";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outdir = path.resolve(dir, "dist");

const pkg = JSON.parse(await readFile(path.resolve(dir, "package.json"), "utf8"));
const external = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(
  (name) => !name.startsWith("@namma-seva/"),
);

await rm(outdir, { recursive: true, force: true });
await build({
  // API, indexer (separate process, plan §9.3) and the migration runner.
  entryPoints: {
    index: path.resolve(dir, "src/index.ts"),
    indexer: path.resolve(dir, "src/indexer/main.ts"),
    migrate: path.resolve(dir, "src/migrate.ts"),
  },
  platform: "node",
  target: "node22",
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

// Drizzle migrations ship next to the bundle (see MIGRATIONS_DIR in @namma-seva/db).
await cp(path.resolve(dir, "../../packages/db/drizzle"), path.resolve(outdir, "drizzle"), { recursive: true });
