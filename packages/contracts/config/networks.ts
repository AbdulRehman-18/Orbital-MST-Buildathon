// Per-network deployment settings. Role holders live in config/roles.<network>.json (fix L-1:
// no hard-coded Hardhat accounts in deploy scripts).
import type { ModeName } from "../scripts/lib/system.js";

export type NetworkSettings = {
  /** LEDGER for real deployments (INR paise, PFMS refs); ESCROW for demos with native MSTC. */
  mode: ModeName;
  /** Refund recipient for ESCROW mode. `"deployer"` uses the deploying account (testnets only). */
  treasury: string | "deployer";
  grievance: { escalationThreshold: number; maxPerDay: number; responseSlaSeconds: number };
  /** Governance: deploy multisig + timelock and hand ADMIN to the timelock after setup. */
  governance?: { owners: string[]; threshold: number; timelockDelaySeconds: number; handOver: boolean };
  /** Blocks to wait after each deploy tx (≈ confirmations; ADR 0004). */
  confirmations: number;
};

const WEEK = 7 * 24 * 60 * 60;

export const NETWORK_SETTINGS: Record<string, NetworkSettings> = {
  hardhat: {
    mode: "ESCROW",
    treasury: "deployer",
    grievance: { escalationThreshold: 3, maxPerDay: 3, responseSlaSeconds: WEEK },
    confirmations: 1,
  },
  // Local dev + the web demo mirror the pilot/mainnet: LEDGER mode, amounts in INR paise.
  // `NS_LOCAL_MODE=ESCROW` switches to native-coin escrow for testing that path.
  localhost: {
    mode: process.env.NS_LOCAL_MODE === "ESCROW" ? "ESCROW" : "LEDGER",
    treasury: "deployer",
    grievance: { escalationThreshold: 3, maxPerDay: 3, responseSlaSeconds: WEEK },
    confirmations: 1,
  },
  // Buildathon demo: ESCROW mode so the lifecycle moves real tMSTC; deployer keeps ADMIN so
  // the team can iterate. Switch to LEDGER + governance for the ward pilot (Phase 6).
  mstTestnet: {
    mode: "ESCROW",
    treasury: "deployer",
    grievance: { escalationThreshold: 5, maxPerDay: 3, responseSlaSeconds: WEEK },
    confirmations: 2,
  },
  // Mainnet: values that must be a deliberate choice come from the environment so nothing
  // placeholder can ship (scripts/deploy.ts refuses a zero treasury and anything short of 3-of-5).
  mstMainnet: {
    mode: "LEDGER",
    treasury: process.env.NS_TREASURY ?? "0x0000000000000000000000000000000000000000",
    grievance: { escalationThreshold: 25, maxPerDay: 3, responseSlaSeconds: WEEK },
    governance: {
      owners: (process.env.NS_GOVERNANCE_OWNERS ?? "").split(",").map((a) => a.trim()).filter(Boolean),
      threshold: 3,
      timelockDelaySeconds: 48 * 60 * 60,
      handOver: true,
    },
    confirmations: 6,
  },
};
