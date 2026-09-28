// `pnpm --filter @namma-seva/db migrate | seed`
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, createPool, runMigrations } from "./index";
import { seedReferenceData } from "./seed";

const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");
if (existsSync(rootEnv) && !process.env.DATABASE_URL) process.loadEnvFile(rootEnv);

const command = process.argv[2];
const pool = createPool(process.env.DATABASE_URL, 1);
try {
  if (command === "migrate") {
    await runMigrations(pool);
    console.log("Migrations applied.");
  } else if (command === "seed") {
    const counts = await seedReferenceData(createDb(pool));
    console.log(`Seeded ${counts.wards} wards and ${counts.departments} departments.`);
  } else {
    console.error("Usage: cli.ts <migrate|seed>");
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
