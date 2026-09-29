// Public trust report (plan §8.4 go/no-go, §16): verified contract addresses, who holds ADMIN, the
// timelock delay and multisig threshold, and the network's honest trust assumptions. Read from chain
// on demand and cached briefly, so 500 concurrent readers cost one RPC round-trip per interval.
import { GetTransparencyResponse } from "@namma-seva/api-zod";
import { addressUrl, nammaSevaMultisigAbi, nammaSevaTimelockAbi } from "@namma-seva/chain";
import { accountRoles, eq } from "@namma-seva/db";
import { Contract, id as keccakId, ZeroAddress } from "ethers";
import { Router, type IRouter } from "express";
import type { AppContext } from "../context";
import { indexerLag } from "../indexer/indexer";
import { handler } from "../lib/http";

const CACHE_MS = 15_000;
const DEFAULT_ADMIN_ROLE = "0x" + "00".repeat(32);

type Governance = {
  adminKind: "EOA" | "MULTISIG_TIMELOCK" | "UNKNOWN";
  adminHolder: string | null;
  multisig: { address: string; threshold: number; owners: string[] } | null;
  timelockDelaySeconds: number | null;
  paused: boolean | null;
  pausers: string[];
};

const UNKNOWN: Governance = { adminKind: "UNKNOWN", adminHolder: null, multisig: null, timelockDelaySeconds: null, paused: null, pausers: [] };
const PAUSER_ROLE = keccakId("PAUSER");

export default function transparencyRoutes(ctx: AppContext): IRouter {
  const router: IRouter = Router();
  const { config, db } = ctx;
  let cache: { at: number; body: unknown } | undefined;

  /** Role holders from the indexed RoleGranted/RoleRevoked events; the chain confirms each one. */
  async function holders(role: "ADMIN" | "PAUSER", roleId: string): Promise<string[]> {
    const rows = await db.select({ address: accountRoles.address }).from(accountRoles).where(eq(accountRoles.role, role));
    const access = ctx.chain!.contracts.contract("NammaSevaAccess", ctx.chain!.provider);
    const confirmed = await Promise.all(
      rows.map(async (r) => {
        try {
          return (await access.hasRole(roleId, r.address)) as boolean;
        } catch {
          return true; // chain unreachable: trust the index rather than hide a holder
        }
      }),
    );
    return rows.filter((_, i) => confirmed[i]).map((r) => r.address.toLowerCase());
  }

  async function governance(): Promise<Governance> {
    if (!ctx.chain) return UNKNOWN;
    const { provider, contracts } = ctx.chain;
    const access = contracts.contract("NammaSevaAccess", provider);
    const g: Governance = { ...UNKNOWN };
    try {
      g.paused = (await access.paused()) as boolean;
    } catch {
      /* leave null */
    }
    try {
      g.pausers = await holders("PAUSER", PAUSER_ROLE);
      const admins = await holders("ADMIN", DEFAULT_ADMIN_ROLE);
      // Exactly one ADMIN is the normal (and only classifiable) state; anything else stays UNKNOWN.
      if (admins.length !== 1) return g;
      const holder = admins[0];
      g.adminHolder = holder;

      const { NammaSevaTimelock: timelock, NammaSevaMultisig: multisig } = contracts.deployment.contracts;
      if (timelock && multisig && holder === timelock.address.toLowerCase()) {
        const tl = new Contract(timelock.address, nammaSevaTimelockAbi, provider);
        const ms = new Contract(multisig.address, nammaSevaMultisigAbi, provider);
        const [delay, threshold, owners] = await Promise.all([tl.getMinDelay(), ms.threshold(), ms.getOwners()]);
        g.adminKind = "MULTISIG_TIMELOCK";
        g.timelockDelaySeconds = Number(delay);
        g.multisig = { address: multisig.address.toLowerCase(), threshold: Number(threshold), owners: (owners as string[]).map((o) => o.toLowerCase()) };
      } else if (holder !== ZeroAddress && (await provider.getCode(holder)) === "0x") {
        g.adminKind = "EOA";
      }
    } catch (err) {
      ctx.logger.warn({ err: (err as Error).message }, "Transparency: governance read failed");
    }
    return g;
  }

  router.get(
    "/transparency",
    handler(async (_req, res) => {
      if (cache && Date.now() - cache.at < CACHE_MS) return void res.json(cache.body);

      const deployment = ctx.chain?.contracts.deployment ?? null;
      const explorer = config.network.blockExplorers.default.url;
      const lag = await indexerLag(db, config.chainName).catch(() => null);
      const head = ctx.chain ? await ctx.chain.provider.getBlockNumber().catch(() => null) : null;

      const body = GetTransparencyResponse.parse({
        network: {
          name: config.network.name,
          chainId: config.network.id,
          explorerUrl: explorer,
          consensus: "PoSA",
          testnet: config.network.testnet,
        },
        mode: deployment?.mode ?? null,
        deployment: deployment
          ? { blockNumber: deployment.blockNumber, commit: deployment.commit, deployedAt: deployment.deployedAt }
          : null,
        contracts: Object.entries(deployment?.contracts ?? {}).map(([name, c]) => ({
          name,
          address: c!.address,
          implementation: c!.implementation ?? null,
          explorerUrl: explorer ? addressUrl(config.network, c!.address) : null,
        })),
        governance: await governance(),
        status: {
          headBlock: head ?? lag?.headBlock ?? null,
          indexedBlock: lag?.lastBlock ?? null,
          lagBlocks: head !== null && lag ? Math.max(head - lag.lastBlock, 0) : (lag?.lagBlocks ?? null),
        },
        disclosure: config.disclosure,
        consentVersion: config.consentVersion,
      });
      cache = { at: Date.now(), body };
      res.json(body);
    }),
  );

  return router;
}
