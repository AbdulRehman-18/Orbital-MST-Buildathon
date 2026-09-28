// Deployment manifests: packages/contracts/deployments/<network>.json, mirrored to
// packages/chain/deployments/<network>.json for the API and web app. `blockNumber` is where the
// Phase 3 indexer starts reading logs.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CONTRACTS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const CHAIN_PACKAGE = path.resolve(CONTRACTS_ROOT, "../chain");

export type DeployedContract = {
  address: string;
  /** Present for UUPS proxies. */
  implementation?: string;
  /** Constructor args of the deployed bytecode (implementation for proxies) — used by verify. */
  constructorArgs?: unknown[];
  /** Fully qualified name, e.g. contracts/ProjectRegistry.sol:ProjectRegistry */
  fqn: string;
};

export type Deployment = {
  network: string;
  chainId: number;
  blockNumber: number;
  commit: string;
  deployedAt: string;
  deployer: string;
  mode: "LEDGER" | "ESCROW";
  contracts: Record<string, DeployedContract>;
};

/** Networks whose manifests are throwaway and never mirrored into @namma-seva/chain. */
const EPHEMERAL = new Set(["hardhat"]);

export function manifestPath(network: string) {
  return path.join(CONTRACTS_ROOT, "deployments", `${network}.json`);
}

export function readDeployment(network: string): Deployment {
  const file = manifestPath(network);
  if (!existsSync(file)) {
    throw new Error(`No deployment for "${network}" at ${file}. Run the deploy script for that network first.`);
  }
  return JSON.parse(readFileSync(file, "utf8")) as Deployment;
}

export function writeDeployment(d: Deployment) {
  if (EPHEMERAL.has(d.network)) return;
  const json = JSON.stringify(d, null, 2) + "\n";
  for (const dir of [path.join(CONTRACTS_ROOT, "deployments"), path.join(CHAIN_PACKAGE, "deployments")]) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${d.network}.json`), json);
  }
}

export function gitCommit(): string {
  try {
    const sha = execSync("git rev-parse HEAD", { cwd: CONTRACTS_ROOT, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    const dirty = execSync("git status --porcelain", { cwd: CONTRACTS_ROOT, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return "unknown";
  }
}

export function explorerBase(chainId: number): string | undefined {
  return { 91562037: "https://testnet.mstscan.com", 4646: "https://mstscan.com" }[chainId];
}

export function txLink(chainId: number, hash: string) {
  const base = explorerBase(chainId);
  return base ? `${base}/tx/${hash}` : hash;
}

export function addressLink(chainId: number, address: string) {
  const base = explorerBase(chainId);
  return base ? `${base}/address/${address}` : address;
}
