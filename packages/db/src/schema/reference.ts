import { integer, jsonb, pgTable, smallint, text } from "drizzle-orm/pg-core";

/** Municipal wards. `id` is the on-chain `wardId` (BBMP ward number). */
export const wards = pgTable("wards", {
  id: integer("id").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameKn: text("name_kn").notNull(),
  nameTa: text("name_ta").notNull(),
  nameHi: text("name_hi").notNull(),
  city: text("city").notNull(),
  /** GeoJSON geometry of the ward boundary, when known. */
  geojson: jsonb("geojson"),
});

/** Departments. `id` is the on-chain `departmentId` (uint16). */
export const departments = pgTable("departments", {
  id: smallint("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
});
