// In-process Postgres (PGlite) with migrations applied, for tests that must run without Docker.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { MIGRATIONS_DIR, type Db } from "./index";
import * as schema from "./schema";

export async function createTestDb(): Promise<{ db: Db; client: PGlite; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db: db as unknown as Db, client, close: () => client.close() };
}
