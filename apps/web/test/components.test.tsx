import { render, screen } from "@testing-library/react";
import i18n from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/common/status-badge";
import { workspacesFor } from "@/components/layout/nav";
import { formatAmount, percent, shortAddress, toChainAmount } from "@/lib/format";
import { wardName } from "@/lib/wards";

afterEach(() => void i18n.changeLanguage("en"));

describe("amounts (LEDGER = INR paise, ESCROW = wei)", () => {
  it("formats rupees with Indian grouping and lakh/crore", () => {
    expect(formatAmount("450000000", "LEDGER")).toBe("₹45,00,000");
    expect(formatAmount("450000000", "LEDGER", { compact: true })).toBe("₹45 L");
    expect(formatAmount(1_20_00_000_00n, "LEDGER", { compact: true })).toBe("₹1.2 Cr");
    expect(formatAmount(null, "LEDGER")).toBe("—");
  });

  it("parses what officials type into the on-chain unit", () => {
    expect(toChainAmount("10,00,000", "LEDGER")).toBe(10_00_000_00n);
    expect(toChainAmount("₹ 12.5", "LEDGER")).toBe(1250n);
    expect(toChainAmount("1.5", "ESCROW")).toBe(15n * 10n ** 17n);
    expect(() => toChainAmount("abc", "LEDGER")).toThrow();
  });

  it("computes progress and shortens addresses", () => {
    expect(percent("1800000", "4800000")).toBe(37.5);
    expect(percent("1", "0")).toBe(0);
    expect(shortAddress("0x70997970c51812dc3a010c7d01b50e0d17dc79c8")).toBe("0x7099…79c8");
  });
});

describe("role-scoped navigation", () => {
  it("gives each role only its own workspace", () => {
    expect(workspacesFor(["CITIZEN"]).map((w) => w.path)).toEqual(["/citizen"]);
    expect(workspacesFor(["AUDITOR"]).map((w) => w.path)).toEqual(["/auditor"]);
    expect(workspacesFor(["PUBLIC"])).toEqual([]);
    expect(workspacesFor(["GOVT_OFFICIAL", "CONTRACTOR"]).map((w) => w.path)).toEqual(["/official", "/contractor"]);
  });
});

describe("i18n", () => {
  it("renders statuses in all four languages", async () => {
    const { rerender } = render(<StatusBadge status="PENDING_APPROVAL" />);
    expect(screen.getByText("Awaiting approval")).toBeInTheDocument();
    for (const [lang, text] of [
      ["kn", "ಅನುಮೋದನೆಗಾಗಿ ಕಾಯುತ್ತಿದೆ"],
      ["ta", "ஒப்புதலுக்காகக் காத்திருக்கிறது"],
      ["hi", "अनुमोदन की प्रतीक्षा"],
    ] as const) {
      await i18n.changeLanguage(lang);
      rerender(<StatusBadge status="PENDING_APPROVAL" />);
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it("picks the ward name for the UI language", () => {
    const w = { nameEn: "Koramangala", nameKn: "ಕೋರಮಂಗಲ", nameTa: "கோரமங்களா", nameHi: "कोरमंगला" };
    expect(wardName(w, "kn")).toBe("ಕೋರಮಂಗಲ");
    expect(wardName(w, "en")).toBe("Koramangala");
  });
});
