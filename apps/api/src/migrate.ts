// `node dist/migrate.mjs [--seed]` — applies Drizzle migrations (and reference data) in containers,
// where drizzle-kit / tsx are not installed.
import { createDb, runMigrations } from "@namma-seva/db";
import { seedReferenceData } from "@namma-seva/db/seed";
import { loadConfig } from "./config";
import { logger } from "./lib/logger";
import { connectDb } from "./runtime";

const config = loadConfig();
const { pool } = connectDb(config, 1);
try {
  await runMigrations(pool);
  logger.info("Migrations applied");
  if (process.argv.includes("--seed")) {
    const counts = await seedReferenceData(createDb(pool));
    logger.info(counts, "Reference data seeded");
  }
} finally {
  await pool.end();
}
