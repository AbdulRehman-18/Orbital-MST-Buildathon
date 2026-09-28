import {
  grievanceRegistryAbi,
  milestoneEscrowAbi,
  nammaSevaAccessAbi,
  projectRegistryAbi,
  tenderRegistryAbi,
  trustedForwarderAbi,
  type ContractName,
  type Deployment,
} from "@namma-seva/chain";
import { Contract, Interface, id, type ContractRunner, type InterfaceAbi } from "ethers";
import { requireAddress } from "./config";

/** Contracts whose events feed the read model. */
export const INDEXED = [
  "NammaSevaAccess",
  "ProjectRegistry",
  "MilestoneEscrow",
  "GrievanceRegistry",
  "TenderRegistry",
] as const satisfies readonly ContractName[];
export type IndexedContract = (typeof INDEXED)[number];

const ABIS = {
  NammaSevaAccess: nammaSevaAccessAbi,
  ProjectRegistry: projectRegistryAbi,
  MilestoneEscrow: milestoneEscrowAbi,
  GrievanceRegistry: grievanceRegistryAbi,
  TenderRegistry: tenderRegistryAbi,
  TrustedForwarder: trustedForwarderAbi,
} as const;

export const interfaces = Object.fromEntries(
  Object.entries(ABIS).map(([name, abi]) => [name, new Interface(abi as InterfaceAbi)]),
) as Record<keyof typeof ABIS, Interface>;

/** Resolved addresses (lower-case) for the deployment, plus the reverse lookup the indexer needs. */
export type ChainContracts = {
  deployment: Deployment;
  address: Record<keyof typeof ABIS, string>;
  byAddress: Map<string, IndexedContract>;
  indexedAddresses: string[];
  startBlock: number;
  contract: (name: keyof typeof ABIS, runner?: ContractRunner) => Contract;
};

export function resolveContracts(deployment: Deployment): ChainContracts {
  const address = Object.fromEntries(
    Object.keys(ABIS).map((name) => [name, requireAddress(deployment, name as ContractName)]),
  ) as Record<keyof typeof ABIS, string>;
  const byAddress = new Map<string, IndexedContract>(INDEXED.map((n) => [address[n], n]));
  return {
    deployment,
    address,
    byAddress,
    indexedAddresses: INDEXED.map((n) => address[n]),
    startBlock: deployment.blockNumber,
    contract: (name, runner) => new Contract(address[name], interfaces[name], runner),
  };
}

// Role ids as emitted in RoleGranted / RoleRevoked (NammaSevaAccess constants).
export const ROLE_IDS: Record<string, string> = {
  [id("GOVT_OFFICIAL")]: "GOVT_OFFICIAL",
  [id("AUDITOR")]: "AUDITOR",
  [id("CONTRACTOR")]: "CONTRACTOR",
  [id("RELAYER")]: "RELAYER",
  [id("PAUSER")]: "PAUSER",
  ["0x" + "00".repeat(32)]: "ADMIN",
};

// Solidity enum orderings (contracts/interfaces/IProjectRegistry.sol, MilestoneEscrow.sol, …).
export const PROJECT_STATUS = ["PENDING_APPROVAL", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"] as const;
export const PROJECT_CATEGORY = [
  "ROAD",
  "DRAINAGE",
  "WATER_SUPPLY",
  "STREET_LIGHTING",
  "PARK",
  "BUILDING",
  "OTHER",
] as const;
export const MILESTONE_STATUS = ["PENDING", "PROOF_SUBMITTED", "APPROVED", "REJECTED", "PAID", "VOID"] as const;
export const GRIEVANCE_CATEGORY = ["QUALITY", "DELAY", "SAFETY", "MISSING_WORK", "CORRUPTION", "OTHER"] as const;
export const GRIEVANCE_STATUS = ["OPEN", "ESCALATED", "RESPONDED"] as const;
export const GRIEVANCE_ACTION = ["NONE", "PAUSE_PROJECT", "DISMISS"] as const;
export const TENDER_STATUS = ["OPEN", "AWARDED", "CANCELLED"] as const;

export const enumName = <T extends readonly string[]>(values: T, index: unknown): T[number] => {
  const v = values[Number(index)];
  if (v === undefined) throw new Error(`Enum index ${String(index)} out of range`);
  return v;
};
