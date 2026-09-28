import type { en } from "./locales/en";

type DeepString<T> = { [K in keyof T]: T[K] extends string ? string : DeepString<T[K]> };

/** Every locale must have exactly the keys of `en` — enforced by the type checker. */
export type Messages = DeepString<typeof en>;
