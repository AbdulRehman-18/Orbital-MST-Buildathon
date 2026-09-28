// Fails if any locale is missing a key or has an empty value. Types already catch missing keys
// at compile time; this also catches empty strings and runs in CI without a full typecheck.
import { resources } from "./index";

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  return Object.entries(obj).reduce<Record<string, unknown>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") Object.assign(acc, flatten(v as Record<string, unknown>, key));
    else acc[key] = v;
    return acc;
  }, {});
}

const reference = flatten(resources.en.translation);
let failed = false;
for (const [lang, { translation }] of Object.entries(resources)) {
  const flat = flatten(translation);
  for (const key of Object.keys(reference)) {
    if (typeof flat[key] !== "string" || (flat[key] as string).trim() === "") {
      console.error(`[i18n] ${lang}: missing or empty "${key}"`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log(`[i18n] ${Object.keys(resources).length} locales × ${Object.keys(reference).length} keys OK`);
