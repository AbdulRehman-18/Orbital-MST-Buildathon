import { en } from "./locales/en";
import { hi } from "./locales/hi";
import { kn } from "./locales/kn";
import { ta } from "./locales/ta";
import type { Messages } from "./types";

export type { Messages } from "./types";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "kn", label: "ಕನ್ನಡ" },
  { code: "ta", label: "தமிழ்" },
  { code: "hi", label: "हिन्दी" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: LanguageCode = "en";
export const LANGUAGE_STORAGE_KEY = "ns_lang";

export const resources: Record<LanguageCode, { translation: Messages }> = {
  en: { translation: en },
  kn: { translation: kn },
  ta: { translation: ta },
  hi: { translation: hi },
};
