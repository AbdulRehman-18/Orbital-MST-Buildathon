// Wrapper around `shadcn add` for this Vite app:
//   pnpm --filter @namma-seva/web ui:add <component...>
// Post-processes generated files because the upstream `new-york-v4` registry currently emits
// `import { cn } from "cn"` (and the CLI then installs the unrelated npm package `cn`), and adds
// Next.js-only "use client" directives that Vite warns about.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const components = process.argv.slice(2);
if (components.length === 0) {
  console.error("usage: pnpm ui:add <component...>");
  process.exit(1);
}

const run = (args) => execFileSync("pnpm", args, { cwd: appDir, stdio: "inherit", env: { ...process.env, CI: "1" } });

run(["dlx", "shadcn@latest", "add", "-y", ...components]);

const dirs = ["src/components/ui", "src/hooks"].map((d) => path.join(appDir, d));
for (const dir of dirs) {
  for (const file of readdirSync(dir).filter((f) => /\.tsx?$/.test(f))) {
    const full = path.join(dir, file);
    const before = readFileSync(full, "utf8");
    const after = before
      .replace(/from "cn"/g, 'from "@/lib/utils"')
      .replace(/^"use client"\n\n?/, "");
    if (after !== before) writeFileSync(full, after);
  }
}

const pkg = JSON.parse(readFileSync(path.join(appDir, "package.json"), "utf8"));
if (pkg.dependencies?.cn) run(["remove", "cn"]);
