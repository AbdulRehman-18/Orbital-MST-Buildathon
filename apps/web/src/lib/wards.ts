import type { Ward } from "@namma-seva/api-client";

/** Ward name in the UI language (kn / ta / hi / en). */
export function wardName(w: Pick<Ward, "nameEn" | "nameKn" | "nameTa" | "nameHi">, lang: string) {
  if (lang.startsWith("kn")) return w.nameKn;
  if (lang.startsWith("ta")) return w.nameTa;
  if (lang.startsWith("hi")) return w.nameHi;
  return w.nameEn;
}
