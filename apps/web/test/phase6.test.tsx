import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import i18n from "i18next";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const report = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@namma-seva/api-client", async (orig) => ({
  ...(await orig<typeof import("@namma-seva/api-client")>()),
  getTransparency: vi.fn(async () => report.current),
}));

import { PrivacyPage, TermsPage } from "@/pages/legal";
import TransparencyPage from "@/pages/transparency";
import { CONSENT_VERSION } from "@/lib/consent";

const base = {
  network: { name: "MST Testnet", chainId: 91562037, explorerUrl: "https://testnet.mstscan.com", consensus: "PoSA", testnet: true },
  mode: "LEDGER",
  deployment: { blockNumber: 12, commit: "abcdef1234", deployedAt: "2026-10-01T00:00:00Z" },
  contracts: [
    { name: "NammaSevaAccess", address: "0x5FbDB2315678afecb367f032d93F642f64180aa3", implementation: null, explorerUrl: null },
    { name: "ProjectRegistry", address: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9", implementation: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0", explorerUrl: null },
  ],
  status: { headBlock: 500, indexedBlock: 498, lagBlocks: 2 },
  disclosure: { grievanceOfficer: null, auditReportUrl: null, pilot: null },
  consentVersion: CONSENT_VERSION,
};
const eoa = { adminKind: "EOA", adminHolder: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8", multisig: null, timelockDelaySeconds: null, paused: false, pausers: ["0x70997970c51812dc3a010c7d01b50e0d17dc79c8"] };
const multisig = {
  adminKind: "MULTISIG_TIMELOCK",
  adminHolder: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
  multisig: { address: "0x90f79bf6eb2c4f870365e785982e1f101e93b906", threshold: 3, owners: ["0x1", "0x2", "0x3", "0x4", "0x5"].map((s) => "0x" + s.slice(2).padStart(40, "0")) },
  timelockDelaySeconds: 172800,
  paused: true,
  pausers: ["0x90f79bf6eb2c4f870365e785982e1f101e93b906", "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"],
};

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  report.current = { ...base, governance: eoa };
});
afterEach(() => void i18n.changeLanguage("en"));

describe("consent notice version", () => {
  it("is a date-stamped version the API can compare exactly", () => {
    expect(CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("legal pages", () => {
  it("render every privacy section, in every language", async () => {
    const { unmount } = wrap(<PrivacyPage />);
    const titles: Record<string, string> = { en: "Privacy Notice", kn: "ಗೌಪ್ಯತಾ ಸೂಚನೆ", ta: "தனியுரிமை அறிவிப்பு", hi: "गोपनीयता सूचना" };
    for (const [lang, title] of Object.entries(titles)) {
      await i18n.changeLanguage(lang);
      expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
      expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThanOrEqual(6);
    }
    unmount();
  });

  it("states that no personal data goes on-chain and names the DPDP Act", async () => {
    wrap(<PrivacyPage />);
    expect(await screen.findByText(/never written to MST Blockchain/i)).toBeInTheDocument();
    expect(screen.getByText(/Digital Personal Data Protection Act, 2023/)).toBeInTheDocument();
  });

  it("terms say that public records are permanent", async () => {
    wrap(<TermsPage />);
    expect(await screen.findByText(/cannot be changed or removed, even by us/i)).toBeInTheDocument();
  });

  it("shows the Grievance Officer once configured", async () => {
    report.current = { ...base, governance: eoa, disclosure: { grievanceOfficer: { name: "A. Officer", email: "g@ward.example", phone: "+91 80 0000 0000" }, auditReportUrl: null, pilot: null } };
    wrap(<PrivacyPage />);
    expect(await screen.findByText("A. Officer")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /g@ward.example/ })).toHaveAttribute("href", "mailto:g@ward.example");
  });
});

describe("Transparency page", () => {
  it("lists contract addresses and discloses the PoSA trust assumption", async () => {
    wrap(<TransparencyPage />);
    expect(await screen.findByText("NammaSevaAccess")).toBeInTheDocument();
    expect(screen.getByText("ProjectRegistry")).toBeInTheDocument();
    expect(screen.getByText(/Proof-of-Staked-Authority/)).toBeInTheDocument();
    expect(screen.getByText(/No name, phone number or other personal data is written on-chain/)).toBeInTheDocument();
  });

  it("warns loudly when a single wallet holds ADMIN", async () => {
    wrap(<TransparencyPage />);
    expect(await screen.findByText(/single wallet — acceptable for testnet and pilot only/i)).toBeInTheDocument();
  });

  it("describes a multisig behind a timelock, with signers and delay, and the pause state", async () => {
    report.current = { ...base, governance: multisig };
    wrap(<TransparencyPage />);
    expect(await screen.findByText("A 3-of-5 multisig behind a timelock")).toBeInTheDocument();
    expect(screen.getByText("48 hours")).toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(screen.getByText("Emergency stop can be triggered by")).toBeInTheDocument();
  });

  it("links the audit report when one is published, otherwise says it is pending", async () => {
    const { unmount } = wrap(<TransparencyPage />);
    expect(await screen.findByText(/audit in progress/i)).toBeInTheDocument();
    unmount();

    report.current = { ...base, governance: eoa, disclosure: { grievanceOfficer: null, auditReportUrl: "https://example.org/audit.pdf", pilot: "Ward 150" } };
    wrap(<TransparencyPage />);
    const link = await screen.findByRole("link", { name: "Read the audit report" });
    expect(link).toHaveAttribute("href", "https://example.org/audit.pdf");
    expect(within(document.body).getByText(/Ward 150|one-ward pilot/i)).toBeInTheDocument();
  });

  it("is available in Kannada", async () => {
    await i18n.changeLanguage("kn");
    wrap(<TransparencyPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "ಪಾರದರ್ಶಕತೆ" })).toBeInTheDocument();
  });
});
