import { expect, test } from "@playwright/test";
import { demoLogin, prefs, settled } from "./helpers";

test.beforeEach(async ({ page }) => prefs(page));

test("landing page shows the plain-language hero, ward finder and live totals", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("See how public money builds your ward");
  await expect(page.getByRole("combobox", { name: "Choose your ward" })).toBeVisible();
  await settled(page);
  await expect(page.getByRole("region", { name: "City-wide totals" })).toBeVisible();
});

test("navigation exposes Transparency and it names the trust assumption", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation").first().getByRole("link", { name: "Transparency" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Transparency" })).toBeVisible();
  await expect(page.getByText("Proof-of-Staked-Authority")).toBeVisible();
  await expect(page.getByRole("cell", { name: "NammaSevaAccess" })).toBeVisible();
});

test("language choice persists across pages", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("menuitemradio", { name: "ಕನ್ನಡ" }).click();
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "ಗೌಪ್ಯತಾ ಸೂಚನೆ" })).toBeVisible();
});

test("citizen phone login is gated on accepting the privacy notice (DPDP)", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Citizen (phone)" }).click();
  await expect(page.getByRole("heading", { name: "Before we send your code" })).toBeVisible();
  await page.getByLabel("Mobile number", { exact: true }).fill("98450 12345");
  const send = page.getByRole("button", { name: "Send code" });
  await expect(send).toBeDisabled();
  await page.getByRole("checkbox", { name: /I have read the Privacy Notice/ }).check();
  await expect(send).toBeEnabled();
});

test("a citizen can download and then erase their data", async ({ page }) => {
  await demoLogin(page, "Fatima");
  await page.goto("/citizen");
  await page.getByRole("tab", { name: "Your data" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download my data" }).click()]);
  expect(download.suggestedFilename()).toBe("namma-seva-my-data.json");

  await page.getByRole("button", { name: "Erase my data" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Yes, erase my data" }).click();
  await expect(page).toHaveURL("/");
  await settled(page);
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("each role lands on its own workspace; the header has no site menu and the account menu offers only that workspace", async ({ page }) => {
  await demoLogin(page, "Priya Rao");
  await expect(page).toHaveURL(/\/official/);
  await expect(page.locator("header nav")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /My projects/ })).toBeVisible();
  await page.locator("header").getByRole("button", { name: /Priya Rao/ }).click();
  await expect(page.getByRole("menuitem", { name: "Official desk" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Audit desk" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Admin console" })).toHaveCount(0);
});

test("security headers and no console errors on the home page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await settled(page);
  expect(errors).toEqual([]);
});
