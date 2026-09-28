import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The monorepo root (directory holding pnpm-workspace.yaml), found by walking up from this module —
 * works both from `src/` (tsx) and from the esbuild bundle in `dist/`. Undefined inside containers,
 * which ship without the workspace.
 */
export const WORKSPACE_ROOT: string | undefined = (() => {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
})();
