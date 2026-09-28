// Shared bootstrap for the API and indexer processes.
import { createDb, createPool, type Db } from "@namma-seva/db";
import type { Provider } from "ethers";
import type pg from "pg";
import { assertChainId, createProvider, loadDeployment } from "./chain/config";
import { resolveContracts, type ChainContracts } from "./chain/contracts";
import type { Config } from "./config";

export type Chain = { provider: Provider; contracts: ChainContracts };

export function connectDb(config: Config, max = 10): { pool: pg.Pool; db: Db } {
  const pool = createPool(config.databaseUrl, max);
  return { pool, db: createDb(pool) };
}

/** Provider + contracts, after the chain-id startup guard (plan §9.2). */
export async function connectChain(config: Config): Promise<Chain> {
  const provider = createProvider(config.chain.rpcUrls, config.network.id, config.chainName);
  await assertChainId(provider, config.network.id);
  const deployment = loadDeployment(config);
  if (deployment.chainId !== config.network.id) {
    throw new Error(`Deployment manifest is for chain ${deployment.chainId}, but NS_CHAIN is ${config.network.id}.`);
  }
  return { provider, contracts: resolveContracts(deployment) };
}
