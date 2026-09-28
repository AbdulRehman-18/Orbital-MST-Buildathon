// Replaces DecentraliTrack's services/blockchainConfig.ts (plan §9.2).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getDeployment, type ContractName, type Deployment } from "@namma-seva/chain";
import { FallbackProvider, JsonRpcProvider, Network as EthersNetwork, type Provider } from "ethers";
import type { Config } from "../config";
import { WORKSPACE_ROOT } from "../lib/paths";

const CHAIN_DEPLOYMENTS = WORKSPACE_ROOT ? path.join(WORKSPACE_ROOT, "packages/chain/deployments") : "deployments";

/** Hardhat's network name for `NS_CHAIN=local` deployments. */
const MANIFEST_NAME: Record<string, string> = { local: "localhost" };

/**
 * `ethers.FallbackProvider` over every RPC URL (quorum 1, 2 s stall) — or a plain JSON-RPC
 * provider when there is only one URL. The network is pinned so ethers never auto-detects it.
 */
export function createProvider(rpcUrls: string[], chainId: number, name = "mst"): Provider {
  if (rpcUrls.length === 0) throw new Error("No RPC URLs configured (MST_RPC_URLS).");
  const network = new EthersNetwork(name, chainId);
  const rpc = (url: string) => new JsonRpcProvider(url, network, { staticNetwork: network, batchMaxCount: 20 });
  if (rpcUrls.length === 1) return rpc(rpcUrls[0]);
  return new FallbackProvider(
    rpcUrls.map((url, i) => ({ provider: rpc(url), priority: i + 1, stallTimeout: 2000, weight: 1 })),
    network,
    { quorum: 1 },
  );
}

/** Startup guard (plan §9.2): refuse to run against the wrong chain. */
export async function assertChainId(provider: Provider, expected: number): Promise<void> {
  // Ask the node directly — the provider's pinned network would otherwise echo our own config.
  const rpc = provider instanceof FallbackProvider ? provider.providerConfigs[0].provider : provider;
  const hex = await (rpc as JsonRpcProvider).send("eth_chainId", []);
  const actual = Number(BigInt(hex));
  if (actual !== expected) {
    throw new Error(`RPC is on chain ${actual}, expected ${expected}. Check NS_CHAIN / MST_RPC_URLS.`);
  }
}

/**
 * Deployment manifest for the configured chain: `NS_DEPLOYMENT_FILE` if set, else the manifest
 * embedded in @namma-seva/chain, else `packages/chain/deployments/<network>.json` on disk
 * (always the case for `local`, whose manifest is git-ignored).
 */
export function loadDeployment(config: Pick<Config, "chainName" | "chain">): Deployment {
  if (config.chain.deploymentFile) return readManifest(config.chain.deploymentFile);
  const name = MANIFEST_NAME[config.chainName] ?? config.chainName;
  const embedded = getDeployment(name);
  if (embedded) return embedded;
  const file = path.join(CHAIN_DEPLOYMENTS, `${name}.json`);
  if (!existsSync(file)) {
    throw new Error(
      `No deployment manifest for "${config.chainName}" (looked for ${file}). ` +
        `Deploy first: pnpm --filter @namma-seva/contracts deploy:${config.chainName === "local" ? "local" : "mst-testnet"}`,
    );
  }
  return readManifest(file);
}

function readManifest(file: string): Deployment {
  return JSON.parse(readFileSync(file, "utf8")) as Deployment;
}

export function requireAddress(deployment: Deployment, name: ContractName): string {
  const address = deployment.contracts[name]?.address;
  if (!address) throw new Error(`${name} missing from the ${deployment.network} deployment manifest.`);
  return address.toLowerCase();
}
