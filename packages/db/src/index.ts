import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema";

export type Schema = typeof schema;
/** Any Drizzle Postgres database with this schema (node-postgres in the app, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
/** A database handle or an open transaction. */
export type DbOrTx = Db | Tx;

const here = path.dirname(fileURLToPath(import.meta.url));
/** packages/db/drizzle from source; `dist/drizzle` (copied by apps/api/build.mjs) from a bundle. */
export const MIGRATIONS_DIR =
  process.env.NS_MIGRATIONS_DIR ??
  [path.resolve(here, "../drizzle"), path.resolve(here, "drizzle")].find((p) => existsSync(path.join(p, "meta"))) ??
  path.resolve(here, "../drizzle");

export function createPool(connectionString = process.env.DATABASE_URL, max = 10): pg.Pool {
  if (!connectionString) throw new Error("DATABASE_URL must be set (see .env.example).");
  return new pg.Pool({ connectionString, max });
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema }) as unknown as Db;
}

export async function runMigrations(pool: pg.Pool): Promise<void> {
  await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_DIR });
}

export * from "./schema";
export { schema };
export type { SQL } from "drizzle-orm";
export {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
  sum,
} from "drizzle-orm";
