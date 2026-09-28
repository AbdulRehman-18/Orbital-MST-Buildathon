import { sql } from "drizzle-orm";
import type { Db } from "./index";
import { departments, wards } from "./schema";
import { BBMP_WARDS, DEPARTMENTS } from "./seed-data";

/** Upserts reference data. Safe to run repeatedly. */
export async function seedReferenceData(db: Db): Promise<{ wards: number; departments: number }> {
  await db
    .insert(wards)
    .values(
      BBMP_WARDS.map((w) => ({ id: w.id, nameEn: w.en, nameKn: w.kn, nameTa: w.ta, nameHi: w.hi, city: "Bengaluru" })),
    )
    .onConflictDoUpdate({
      target: wards.id,
      set: {
        nameEn: sql`excluded.name_en`,
        nameKn: sql`excluded.name_kn`,
        nameTa: sql`excluded.name_ta`,
        nameHi: sql`excluded.name_hi`,
        city: sql`excluded.city`,
      },
    });
  await db
    .insert(departments)
    .values(DEPARTMENTS)
    .onConflictDoUpdate({ target: departments.id, set: { code: sql`excluded.code`, name: sql`excluded.name` } });
  return { wards: BBMP_WARDS.length, departments: DEPARTMENTS.length };
}
