import type { Page } from "@playwright/test";

export const LANGS = ["en", "kn", "ta", "hi"] as const;
export type Lang = (typeof LANGS)[number];

/**
 * Seeds the UI language and theme before the app boots (both are read from localStorage). Init
 * scripts run on every navigation, so only seed once — otherwise a language the test switched to
 * would be reset on the next page load.
 */
export async function prefs(page: Page, lang: Lang = "en", theme: "light" | "dark" = "light") {
  await page.addInitScript(
    ([l, t]) => {
      if (!localStorage.getItem("ns_lang")) localStorage.setItem("ns_lang", l);
      if (!localStorage.getItem("ns_theme")) localStorage.setItem("ns_theme", t);
    },
    [lang, theme] as const,
  );
}

/** Signs in through a demo card on /login (demo mode only). `name` is the card's person or company. */
export async function demoLogin(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page.waitForURL((u) => u.pathname !== "/login", { timeout: 30_000 });
}

/** Waits for the app shell and any skeletons to settle. */
export async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.locator("[data-slot=skeleton]").first().waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined);
}
