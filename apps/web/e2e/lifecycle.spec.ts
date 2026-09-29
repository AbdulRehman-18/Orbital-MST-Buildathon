// Every role's main flow, clicked through the UI against the live demo chain (pnpm demo):
//   A. project → approval → funds → milestone → proof → approval → payment → close
//   B. tender → sealed bids → (chain time moves on) → open bids → award
//   C. citizen report with a site photo → neighbours back it → escalated → auditor answers
//   D. admin grants and revokes a role
// It writes real transactions, so it leaves data behind and moves the chain clock forward (B).
// Restart `pnpm demo` for a clean slate.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { demoLogin, prefs } from "./helpers";

test.describe.configure({ mode: "serial", timeout: 180_000 });
test.beforeEach(async ({ page }) => prefs(page));

const RUN = Date.now().toString(36);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const RPC = "http://127.0.0.1:8545";

type Project = { id: number; title: string; status: string; contractorAddr: string | null; funded: string; spent: string };
type Milestone = { id: number; projectId: number; title: string; status: string };

async function project(request: APIRequestContext, title: string): Promise<Project | undefined> {
  const res = await request.get("/api/projects?limit=200");
  return ((await res.json()).items as Project[]).find((p) => p.title === title);
}
async function milestones(request: APIRequestContext, projectId: number): Promise<Milestone[]> {
  const res = await request.get(`/api/milestones?projectId=${projectId}`);
  return (await res.json()) as Milestone[];
}
const until = (fn: () => Promise<unknown>, timeout = 60_000) => expect.poll(fn, { timeout, intervals: [1000, 2000] });

/** Moves the demo chain's clock forward and mines a block (tender deadlines are chain time). */
async function advanceChain(seconds: number) {
  for (const [method, params] of [["evm_increaseTime", [seconds]], ["evm_mine", []]] as const) {
    await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  }
}

async function pick(page: Page, combobox: ReturnType<Page["getByRole"]>, option: string | RegExp) {
  await combobox.click();
  await page.getByRole("option", { name: option }).click();
}

const dialog = (page: Page) => page.getByRole("dialog");
const card = (page: Page, text: string) => page.locator("[data-slot=card], section").filter({ hasText: text }).last();

// ── A. Project lifecycle ─────────────────────────────────────────────────────
const A = `E2E footpath ${RUN}`;
const A_MILESTONE = `E2E kerb stones ${RUN}`;

test("A1 official creates a project with a named contractor", async ({ page, request }) => {
  await demoLogin(page, "Priya Rao");
  await page.getByRole("button", { name: "New project" }).first().click();
  const sheet = dialog(page);
  await sheet.getByPlaceholder("Koramangala 6th Block footpath upgrade").fill(A);
  await sheet.locator("textarea").first().fill("Relay the footpath with interlocking pavers.");
  const boxes = sheet.getByRole("combobox");
  await pick(page, boxes.nth(2), /150/); // ward
  await sheet.getByPlaceholder("25,00,000").fill("5,00,000");
  await pick(page, boxes.nth(3), "Sri Ganesh Constructions"); // contractor, by name
  await pick(page, boxes.nth(4), "1"); // one auditor approval
  await sheet.locator(".leaflet-container").click();
  await sheet.getByRole("button", { name: "Publish & sign" }).click();
  await until(async () => (await project(request, A))?.status).toBe("PENDING_APPROVAL");
});

test("A2 auditor approves the project", async ({ page, request }) => {
  await demoLogin(page, "Rahul Menon");
  await page.getByRole("tab", { name: /Projects awaiting approval/ }).click();
  await card(page, A).getByRole("button", { name: "Approve" }).click();
  await until(async () => (await project(request, A))?.status).toBe("ACTIVE");
});

test("A3 official sanctions funds and adds a milestone from the Milestones tab", async ({ page, request }) => {
  await demoLogin(page, "Priya Rao");
  await page.getByRole("tab", { name: /Milestones/ }).click();
  const panel = page.locator("section").filter({ hasText: A });
  await panel.getByRole("button", { name: "Sanction funds" }).click();
  await dialog(page).getByPlaceholder("10,00,000").fill("5,00,000");
  await dialog(page).locator("input").nth(1).fill(`PFMS-E2E-${RUN}`);
  await dialog(page).getByRole("button", { name: "Sanction funds" }).click();
  await until(async () => (await project(request, A))?.funded).toBe("50000000");

  await panel.getByRole("button", { name: "Add milestone" }).click();
  await dialog(page).getByPlaceholder("Bituminous concrete wearing course").fill(A_MILESTONE);
  await dialog(page).getByPlaceholder("5,00,000").fill("2,00,000");
  await dialog(page).getByRole("button", { name: "Publish & sign" }).click();
  const p = (await project(request, A))!;
  await until(async () => (await milestones(request, p.id)).find((m) => m.title === A_MILESTONE)?.status).toBe("PENDING");
});

test("A4 contractor submits geo-tagged proof", async ({ page, request }) => {
  await demoLogin(page, "Sri Ganesh");
  const row = page.locator("li").filter({ hasText: A_MILESTONE });
  await row.getByRole("button", { name: "Submit proof" }).click();
  await dialog(page).locator('input[type="file"]').setInputFiles({ name: "site.png", mimeType: "image/png", buffer: PNG });
  await dialog(page).getByRole("button", { name: "Use site location (demo)" }).click();
  await dialog(page).getByRole("button", { name: /Submit/ }).last().click();
  const p = (await project(request, A))!;
  await until(async () => (await milestones(request, p.id)).find((m) => m.title === A_MILESTONE)?.status).toBe("PROOF_SUBMITTED");
});

test("A5 auditor approves the proof", async ({ page, request }) => {
  await demoLogin(page, "Rahul Menon");
  await card(page, A_MILESTONE).getByRole("button", { name: "Approve" }).click();
  const p = (await project(request, A))!;
  await until(async () => (await milestones(request, p.id)).find((m) => m.title === A_MILESTONE)?.status).toBe("APPROVED");
});

test("A6 official releases the payment, then closes the project", async ({ page, request }) => {
  await demoLogin(page, "Priya Rao");
  await page.locator("li").filter({ hasText: A_MILESTONE }).getByRole("button", { name: "Release payment" }).click();
  await dialog(page).getByPlaceholder("SBIN0000123456789").fill(`UTR${RUN}`);
  await dialog(page).getByRole("button", { name: /Release payment/ }).click();
  const p = (await project(request, A))!;
  await until(async () => (await milestones(request, p.id)).find((m) => m.title === A_MILESTONE)?.status).toBe("PAID");
  await until(async () => (await project(request, A))?.spent).toBe("20000000");

  await page.getByRole("tab", { name: /My projects/ }).click();
  await card(page, A).getByRole("button", { name: "Close project" }).click();
  await dialog(page).getByRole("button", { name: /Close project/ }).click();
  await until(async () => (await project(request, A))?.status).toBe("COMPLETED");
});

// ── B. Tender with sealed bids ───────────────────────────────────────────────
const B = `E2E streetlights ${RUN}`;
let tenderId = 0;

test("B1 official creates a project without a contractor and publishes a tender", async ({ page, request }) => {
  await demoLogin(page, "Priya Rao");
  await page.getByRole("button", { name: "New project" }).first().click();
  const sheet = dialog(page);
  await sheet.getByPlaceholder("Koramangala 6th Block footpath upgrade").fill(B);
  await sheet.locator("textarea").first().fill("LED street lights on 3rd Cross.");
  await pick(page, sheet.getByRole("combobox").nth(2), /151/);
  await sheet.getByPlaceholder("25,00,000").fill("4,00,000");
  await sheet.locator(".leaflet-container").click();
  await sheet.getByRole("button", { name: "Publish & sign" }).click();
  await until(async () => (await project(request, B))?.status).toBe("PENDING_APPROVAL");

  await page.getByRole("tab", { name: /Tenders/ }).click();
  await page.locator("li").filter({ hasText: B }).getByRole("button", { name: "Publish tender" }).click();
  const [commit, reveal] = [dialog(page).locator('input[type="number"]').nth(0), dialog(page).locator('input[type="number"]').nth(1)];
  await commit.fill("1");
  await reveal.fill("1");
  await dialog(page).getByRole("button", { name: "Publish tender" }).click();
  const p = (await project(request, B))!;
  await until(async () => {
    const res = await request.get(`/api/tenders?projectId=${p.id}`);
    tenderId = ((await res.json()) as { id: number }[])[0]?.id ?? 0;
    return tenderId;
  }).toBeGreaterThan(0);
});

const backups: Record<string, string> = {};

async function placeBid(page: Page, who: string, price: string) {
  await demoLogin(page, who);
  await page.getByRole("tab", { name: /Open tenders/ }).click();
  await card(page, B).getByRole("button", { name: "Place a sealed bid" }).click();
  await dialog(page).locator("input").fill(price);
  await dialog(page).getByRole("button", { name: "Place a sealed bid" }).click();
  await expect(card(page, B).getByText("Your bid is sealed")).toBeVisible({ timeout: 30_000 });
  // Keep the backup file: every test gets a fresh browser, like opening the bid from another device.
  const [download] = await Promise.all([page.waitForEvent("download"), card(page, B).getByRole("button", { name: "Download backup" }).click()]);
  backups[who] = (await (await download.createReadStream()).toArray()).join("");
}

test("B2 two contractors place sealed bids", async ({ page, request }) => {
  await placeBid(page, "Sri Ganesh", "3,80,000");
  await placeBid(page, "Kaveri Infra", "3,50,000");
  await until(async () => (await (await request.get(`/api/tenders/${tenderId}`)).json()).tender.bidCount).toBe(2);
});

async function openBid(page: Page, who: string) {
  await demoLogin(page, who);
  await page.getByRole("tab", { name: /Open tenders/ }).click();
  await card(page, B).getByRole("button", { name: "Open my bid" }).click();
  await expect(dialog(page).getByText("This browser does not have your secret code.", { exact: false })).toBeVisible();
  await dialog(page).locator("textarea").fill(backups[who]);
  await expect(dialog(page).getByText(/Your price:/)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Open my bid" }).click();
  await expect(card(page, B).getByText(/Your bid is open/)).toBeVisible({ timeout: 30_000 });
}

test("B3 bidding closes; both contractors open their bids", async ({ page, request }) => {
  await advanceChain(26 * 3600);
  await until(async () => (await (await request.get(`/api/tenders/${tenderId}`)).json()).tender.phase).toBe("REVEAL");
  await openBid(page, "Sri Ganesh");
  await openBid(page, "Kaveri Infra");
  await until(async () => (await (await request.get(`/api/tenders/${tenderId}`)).json()).tender.revealedCount).toBe(2);
});

test("B4 opening closes; the official awards the tender to the lowest bid", async ({ page, request }) => {
  await advanceChain(26 * 3600);
  await until(async () => (await (await request.get(`/api/tenders/${tenderId}`)).json()).tender.phase).toBe("AWAITING_AWARD");
  await demoLogin(page, "Priya Rao");
  await page.getByRole("tab", { name: /Tenders/ }).click();
  await card(page, B).getByRole("button", { name: "Award to lowest bid" }).click();
  await dialog(page).getByRole("button", { name: "Award to lowest bid" }).click();
  const demo = await (await request.get("/api/demo")).json();
  const kaveri = (demo.accounts as { name: string; address: string }[]).find((a) => a.name.startsWith("Kaveri"))!.address.toLowerCase();
  await until(async () => (await project(request, B))?.contractorAddr?.toLowerCase()).toBe(kaveri);
});

// ── C. Citizen report ────────────────────────────────────────────────────────
const C_TEXT = `E2E: the footpath slabs near the bus stop are cracked (${RUN}).`;
let grievanceProject = 0;

test("C1 citizen reports a problem with a camera photo taken at the site", async ({ page, context, request }) => {
  const target = (await (await request.get("/api/projects?limit=200")).json()).items.find((p: Project) => p.status === "ACTIVE") as Project & {
    latE6: number;
    lngE6: number;
  };
  grievanceProject = target.id;
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: target.latE6 / 1e6 + 0.0003, longitude: target.lngE6 / 1e6 });
  await demoLogin(page, "Lakshmi");
  await page.getByRole("button", { name: "Report a problem" }).first().click();
  await pick(page, dialog(page).getByRole("combobox").nth(0), target.title);
  await dialog(page).locator("textarea").fill(C_TEXT);
  await dialog(page).getByRole("button", { name: "Take a photo" }).click();
  await dialog(page).locator('input[capture="environment"]').setInputFiles({ name: "site.png", mimeType: "image/png", buffer: PNG });
  await expect(dialog(page).getByText(/Taken \d+ m from the site/)).toBeVisible({ timeout: 20_000 });
  await dialog(page).getByRole("button", { name: "Submit" }).click();
  await page.getByRole("tab", { name: /Your reports/ }).click();
  await expect(page.getByText(C_TEXT)).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("[data-slot=card]").filter({ hasText: C_TEXT }).getByText(/Taken \d+ m from the site/)).toBeVisible();
});

test("C2 three neighbours back the report and it is escalated to the auditors", async ({ page, request }) => {
  for (const who of ["Arjun", "Fatima", "Suresh"]) {
    await demoLogin(page, who);
    await page.goto(`/projects/${grievanceProject}`);
    await page.getByRole("tab", { name: /Grievances/ }).click();
    await page.locator("[data-slot=card]").filter({ hasText: C_TEXT }).getByRole("button", { name: "Upvote" }).click();
    await expect(page.locator("[data-slot=card]").filter({ hasText: C_TEXT }).getByText(/Upvoted/)).toBeVisible({ timeout: 45_000 });
  }
  await until(async () => {
    const gs = (await (await request.get(`/api/grievances?projectId=${grievanceProject}`)).json()) as { status: string; cid: string }[];
    return gs.map((g) => g.status);
  }).toContain("ESCALATED");
});

test("C3 auditor answers the escalated report", async ({ page, request }) => {
  await demoLogin(page, "Rahul Menon");
  await page.getByRole("tab", { name: /Grievances/ }).click();
  const box = page.locator("div.flex.flex-col.gap-2").filter({ hasText: C_TEXT }).last();
  await box.getByRole("button", { name: "Respond" }).click();
  await dialog(page).locator("textarea").fill("Inspected the site; the contractor will replace the slabs this week.");
  await dialog(page).getByRole("button", { name: "Respond" }).click();
  await until(async () => {
    const gs = (await (await request.get(`/api/grievances?projectId=${grievanceProject}&status=RESPONDED`)).json()) as unknown[];
    return gs.length;
  }).toBeGreaterThan(0);
});

// ── D. Admin ─────────────────────────────────────────────────────────────────
test("D1 admin grants a role and revokes it", async ({ page, request }) => {
  const addr = `0x${Date.now().toString(16).padStart(40, "e")}`; // a fresh, valid hex address
  await demoLogin(page, "BBMP IT Cell");
  await page.getByRole("button", { name: "Grant role" }).click();
  await dialog(page).getByPlaceholder("0x…").fill(addr);
  await pick(page, dialog(page).getByRole("combobox").first(), /Auditor|AUDITOR/);
  await dialog(page).getByRole("checkbox").check();
  await dialog(page).getByRole("button", { name: "Grant role" }).click();
  const holders = async () => ((await (await request.get("/api/roles")).json()) as { address: string; roles: string[] }[]).find((h) => h.address === addr.toLowerCase())?.roles ?? [];
  await until(holders).toContain("AUDITOR");

  await page.getByRole("tab", { name: /Role holders/ }).click();
  await page.getByRole("row").filter({ hasText: addr.slice(0, 6) }).filter({ hasText: addr.slice(-4) }).getByRole("button", { name: /AUDITOR/ }).click();
  await until(holders).not.toContain("AUDITOR");
});
