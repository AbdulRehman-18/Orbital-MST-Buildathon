// Accessibility gate (plan §18.4): axe-core must report no WCAG 2.1 A/AA violations on any page,
// in each of the four UI languages (the app has a single light theme). A manual screen-reader pass is still required
// before the pilot (docs/pilot/accessibility.md); automation catches roughly a third of issues.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { demoLogin, LANGS, prefs, settled } from "./helpers";

const PUBLIC_PAGES = ["/", "/projects", "/verify", "/ledger", "/tenders", "/transparency", "/privacy", "/terms", "/login"];

async function audit(page: Page, label: string) {
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // Third-party OpenStreetMap raster tiles and Leaflet attribution are outside our control.
    .exclude(".leaflet-container")
    .analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`);
  expect(summary, `${label}\n${summary.join("\n")}`).toEqual([]);
}

for (const lang of LANGS) {
  test.describe(`axe · public pages · ${lang}`, () => {
    test.beforeEach(async ({ page }) => prefs(page, lang));
    for (const path of PUBLIC_PAGES) {
      test(path, async ({ page }) => {
        await page.goto(path);
        await audit(page, `${path} [${lang}]`);
      });
    }
  });
}

test.describe("axe · signed-in workspaces", () => {
  const WORKSPACES: [name: string, role: string, path: string][] = [
    ["Lakshmi", "citizen", "/citizen"],
    ["Priya Rao", "official", "/official"],
    ["Rahul Menon", "auditor", "/auditor"],
    ["Sri Ganesh", "contractor", "/contractor"],
  ];
  for (const lang of ["en", "kn"] as const) {
    for (const [name, role, path] of WORKSPACES) {
      test(`${role} · ${lang}`, async ({ page }) => {
        await prefs(page, lang);
        await demoLogin(page, name);
        await page.goto(path);
        await audit(page, `${path} [${lang}]`);
      });
    }
  }
});

test("skip link is the first tab stop and moves focus to the content", async ({ page }) => {
  await prefs(page);
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});
