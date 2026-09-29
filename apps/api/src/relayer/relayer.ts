// Gasless citizen actions (plan §9.4). Citizens never hold keys: each verified phone maps to a
// derived signing key that the relayer registers once via `setCitizenSigner`; grievances and upvotes
// are then signed by that key as EIP-712 ForwardRequests and executed through `TrustedForwarder`,
// with the relayer paying gas. Guards: per-citizen daily limit, daily spend cap, balance floor.
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, relayerTxs, sql, type Db } from "@namma-seva/db";
import { concat, formatEther, Interface, parseEther, type Contract, type Provider, Wallet } from "ethers";
import type { Logger } from "pino";
import type { ChainContracts } from "../chain/contracts";
import { interfaces } from "../chain/contracts";
import { forwarderDomain, HmacCitizenKeys, signForwardRequest, type CitizenKeyDeriver } from "./forwarder";
import { metrics } from "../lib/metrics";
import { PermanentError, type JobQueue, type RelayJobData } from "./queue";
import type { TxSender } from "./sender";

export type RelayJobView = {
  jobId: string;
  kind: string;
  status: "queued" | "registering" | "submitted" | "confirmed" | "failed";
  txHash: string | null;
  cid: string | null;
  error: string | null;
};

export type RelayerOptions = {
  db: Db;
  provider: Provider;
  contracts: ChainContracts;
  chainId: number;
  /** Local HMAC root for citizen keys (dev/testnet). Ignored when `citizenKeys` is given. */
  rootPrivateKey?: string;
  citizenKeys?: CitizenKeyDeriver;
  sender: TxSender;
  logger: Logger;
  minBalance: string;
  dailyCap: string;
  citizenDailyLimit: number;
};

/** Gas forwarded to the inner call; fileGrievance with a CID is ~120k. */
const INNER_GAS = 400_000n;
const REQUEST_TTL_S = 60 * 60;

export class RelayerError extends Error {
  constructor(
    readonly status: 400 | 409 | 429 | 503,
    message: string,
  ) {
    super(message);
  }
}

export class Relayer {
  queue!: JobQueue;
  private balance: bigint | null = null;
  private monitor?: NodeJS.Timeout;
  private readonly grievance: Contract;
  private readonly forwarder: Contract;
  private readonly keys: CitizenKeyDeriver;

  constructor(private readonly o: RelayerOptions) {
    if (!o.citizenKeys && !o.rootPrivateKey) throw new Error("Relayer needs `citizenKeys` or `rootPrivateKey`");
    this.keys = o.citizenKeys ?? new HmacCitizenKeys(o.rootPrivateKey!);
    this.grievance = o.contracts.contract("GrievanceRegistry", o.provider);
    this.forwarder = o.contracts.contract("TrustedForwarder", o.provider);
  }

  get address() {
    return this.o.sender.address;
  }

  // ─── Enqueue (API request path) ────────────────────────────────────────

  async enqueueGrievance(
    userId: string,
    citizenHash: string,
    args: { projectId: number; category: number; cid: string },
  ): Promise<RelayJobView> {
    await this.guard(citizenHash);
    return this.enqueue(userId, { jobId: randomUUID(), kind: "grievance", citizenHash, ...args }, args.cid);
  }

  async enqueueUpvote(userId: string, citizenHash: string, grievanceId: number): Promise<RelayJobView> {
    await this.guard(citizenHash);
    return this.enqueue(userId, { jobId: randomUUID(), kind: "upvote", citizenHash, grievanceId }, null);
  }

  async job(jobId: string): Promise<RelayJobView | null> {
    const [row] = await this.o.db
      .select()
      .from(relayerTxs)
      .where(and(eq(relayerTxs.jobId, jobId), inArray(relayerTxs.kind, ["grievance", "upvote"])))
      .orderBy(desc(relayerTxs.createdAt))
      .limit(1);
    if (!row) return null;
    return {
      jobId,
      kind: row.kind,
      status: row.status as RelayJobView["status"],
      txHash: row.txHash,
      cid: row.cid,
      error: row.error,
    };
  }

  /** Owner check for job lookups. */
  async jobOwner(jobId: string): Promise<string | null> {
    const [row] = await this.o.db.select({ userId: relayerTxs.userId }).from(relayerTxs).where(eq(relayerTxs.jobId, jobId)).limit(1);
    return row?.userId ?? null;
  }

  private async enqueue(userId: string, data: RelayJobData, cid: string | null): Promise<RelayJobView> {
    await this.o.db.insert(relayerTxs).values({
      jobId: data.jobId,
      kind: data.kind,
      userId,
      citizenHash: data.citizenHash,
      cid,
      status: "queued",
    });
    await this.queue.add(data);
    return { jobId: data.jobId, kind: data.kind, status: "queued", txHash: null, cid, error: null };
  }

  private async guard(citizenHash: string) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ n }] = await this.o.db
      .select({ n: sql<number>`count(*)::int` })
      .from(relayerTxs)
      .where(
        and(
          eq(relayerTxs.citizenHash, citizenHash),
          inArray(relayerTxs.kind, ["grievance", "upvote"]),
          gte(relayerTxs.createdAt, dayAgo),
        ),
      );
    if (n >= this.o.citizenDailyLimit) {
      throw new RelayerError(429, `Daily limit of ${this.o.citizenDailyLimit} actions reached — try again tomorrow`);
    }
    if ((await this.spentToday()) >= parseEther(this.o.dailyCap)) {
      this.o.logger.error({ cap: this.o.dailyCap }, "Relayer daily spend cap reached");
      throw new RelayerError(503, "Gasless submissions are paused for today (spend cap reached)");
    }
    const balance = this.balance ?? (await this.refreshBalance());
    if (balance === 0n) throw new RelayerError(503, "Relayer is out of funds");
  }

  // ─── Worker ────────────────────────────────────────────────────────────

  process = async (data: RelayJobData): Promise<void> => {
    const { db } = this.o;
    const signer = (await this.keys.derive(data.citizenHash)).connect(this.o.provider);

    const registered = ((await this.grievance.citizenOfSigner(signer.address)) as string).toLowerCase();
    if (registered !== data.citizenHash.toLowerCase()) {
      await this.setStatus(data.jobId, { status: "registering" });
      await db.insert(relayerTxs).values({
        jobId: data.jobId,
        kind: "register-signer",
        citizenHash: data.citizenHash,
        status: "submitted",
      });
      const sent = await this.o.sender.send({
        to: this.o.contracts.address.GrievanceRegistry,
        data: interfaces.GrievanceRegistry.encodeFunctionData("setCitizenSigner", [signer.address, data.citizenHash]),
      });
      await db
        .update(relayerTxs)
        .set({
          txHash: sent.hash,
          nonce: sent.nonce,
          feeWei: sent.feeWei.toString(),
          gasPrice: sent.maxFeePerGas.toString(),
          replacedHashes: sent.replaced,
          status: sent.receipt.status === 1 ? "confirmed" : "failed",
          updatedAt: new Date(),
        })
        .where(and(eq(relayerTxs.jobId, data.jobId), eq(relayerTxs.kind, "register-signer")));
      if (sent.receipt.status !== 1) throw new Error("setCitizenSigner reverted");
    }

    const inner =
      data.kind === "grievance"
        ? interfaces.GrievanceRegistry.encodeFunctionData("fileGrievance", [
            data.projectId,
            data.category,
            data.cid,
            data.citizenHash,
          ])
        : interfaces.GrievanceRegistry.encodeFunctionData("upvote", [data.grievanceId, data.citizenHash]);

    const nonce = (await this.forwarder.nonces(signer.address)) as bigint;
    const block = await this.o.provider.getBlock("latest");
    const request = await signForwardRequest(
      signer,
      forwarderDomain(this.o.chainId, this.o.contracts.address.TrustedForwarder),
      {
        to: this.o.contracts.address.GrievanceRegistry,
        data: inner,
        gas: INNER_GAS,
        nonce,
        deadline: (block?.timestamp ?? Math.floor(Date.now() / 1000)) + REQUEST_TTL_S,
      },
    );
    const outer = interfaces.TrustedForwarder.encodeFunctionData("execute", [request]);

    // Simulate first: a revert here (limit reached, already upvoted, …) will not improve on retry.
    // The forwarder masks inner revert reasons, so simulate the inner call as the forwarder would
    // make it (ERC-2771: signer appended to calldata) to get a readable error, then the outer call.
    const { GrievanceRegistry: registry, TrustedForwarder: forwarderAddr } = this.o.contracts.address;
    try {
      await this.o.provider.call({ from: forwarderAddr, to: registry, data: concat([inner, signer.address]) });
      await this.o.provider.call({ from: this.o.sender.address, to: forwarderAddr, data: outer });
    } catch (err) {
      throw new PermanentError(describeRevert(err));
    }

    const sent = await this.o.sender.send({ to: this.o.contracts.address.TrustedForwarder, data: outer });
    await this.setStatus(data.jobId, {
      status: sent.receipt.status === 1 ? "confirmed" : "failed",
      txHash: sent.hash,
      nonce: sent.nonce,
      feeWei: sent.feeWei.toString(),
      gasPrice: sent.maxFeePerGas.toString(),
      replacedHashes: sent.replaced,
      error: sent.receipt.status === 1 ? null : "Transaction reverted",
    });
    this.balance = null;
  };

  onFailed = async (data: RelayJobData, err: Error) => {
    metrics.txFailures.inc({ kind: data.kind });
    await this.setStatus(data.jobId, { status: "failed", error: err.message.slice(0, 500) });
  };

  private async setStatus(jobId: string, set: Partial<typeof relayerTxs.$inferInsert>) {
    await this.o.db
      .update(relayerTxs)
      .set({ ...set, updatedAt: new Date() })
      .where(and(eq(relayerTxs.jobId, jobId), inArray(relayerTxs.kind, ["grievance", "upvote"])));
  }

  // ─── Monitoring ────────────────────────────────────────────────────────

  async refreshBalance(): Promise<bigint> {
    this.balance = await this.o.provider.getBalance(this.o.sender.address);
    return this.balance;
  }

  async spentToday(): Promise<bigint> {
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    const [{ total }] = await this.o.db
      .select({ total: sql<string>`coalesce(sum(${relayerTxs.feeWei}), 0)::text` })
      .from(relayerTxs)
      .where(gte(relayerTxs.createdAt, midnight));
    return BigInt(total);
  }

  async status() {
    const balance = await this.refreshBalance();
    return {
      address: this.o.sender.address,
      balance: formatEther(balance),
      low: balance < parseEther(this.o.minBalance),
      spentToday: formatEther(await this.spentToday()),
      dailyCap: this.o.dailyCap,
    };
  }

  /** Balance monitor: logs an alert when the relayer drops below RELAYER_MIN_BALANCE (default 10 MSTC). */
  startMonitor(intervalMs = 60_000) {
    const check = async () => {
      try {
        const balance = await this.refreshBalance();
        if (balance < parseEther(this.o.minBalance)) {
          this.o.logger.error(
            { alert: "relayer_low_balance", address: this.o.sender.address, balance: formatEther(balance), min: this.o.minBalance },
            "Relayer balance below threshold — top up",
          );
        }
      } catch (err) {
        this.o.logger.warn({ err: (err as Error).message }, "Relayer balance check failed");
      }
    };
    void check();
    this.monitor = setInterval(check, intervalMs);
    this.monitor.unref();
  }

  async close() {
    clearInterval(this.monitor);
    await this.queue?.close();
  }
}

const REVERT_IFACE = new Interface(
  [...interfaces.GrievanceRegistry.fragments, ...interfaces.TrustedForwarder.fragments].filter((f) => f.type === "error"),
);

/** Human-readable custom error from a failed simulation, e.g. "AlreadyUpvoted(3)". */
export function describeRevert(err: unknown): string {
  const data = (err as { data?: string; info?: { error?: { data?: string } } })?.data ??
    (err as { info?: { error?: { data?: string } } })?.info?.error?.data;
  if (typeof data === "string" && data.length >= 10) {
    try {
      const parsed = REVERT_IFACE.parseError(data);
      if (parsed) return `${parsed.name}(${parsed.args.map(String).join(", ")})`;
    } catch {
      /* fall through */
    }
  }
  return (err as Error)?.message?.slice(0, 200) ?? "Reverted";
}

export function createWallet(privateKey: string, provider: Provider) {
  return new Wallet(privateKey, provider);
}
