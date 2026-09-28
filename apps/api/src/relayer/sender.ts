// Serialised nonce assignment + broadcast for the relayer wallet, with replace-by-nonce gas bumps
// for stuck transactions (plan §9.4, ADR 0005).
import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { parseUnits, type TransactionReceipt, type TransactionRequest, type Wallet } from "ethers";
import type { Logger } from "pino";

/** Cross-process mutex + shared "next nonce" hint. Redis in production; in-memory for dev/tests. */
export type NextNonce = { get(): Promise<number | null>; set(n: number): Promise<void> };

export interface NonceLock {
  withLock<T>(fn: (next: NextNonce) => Promise<T>): Promise<T>;
}

export class MemoryNonceLock implements NonceLock {
  private chain: Promise<unknown> = Promise.resolve();
  private next: number | null = null;

  withLock<T>(fn: (next: NextNonce) => Promise<T>): Promise<T> {
    const run = this.chain.then(() =>
      fn({
        get: async () => this.next,
        set: async (n) => {
          this.next = n;
        },
      }),
    );
    this.chain = run.catch(() => undefined);
    return run;
  }
}

export class RedisNonceLock implements NonceLock {
  constructor(
    private readonly redis: Redis,
    private readonly key: string,
    private readonly ttlMs = 30_000,
  ) {}

  async withLock<T>(fn: (next: NextNonce) => Promise<T>): Promise<T> {
    const token = randomUUID();
    const lockKey = `${this.key}:lock`;
    const deadline = Date.now() + this.ttlMs;
    while ((await this.redis.set(lockKey, token, "PX", this.ttlMs, "NX")) !== "OK") {
      if (Date.now() > deadline) throw new Error("Timed out waiting for the relayer nonce lock");
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
    }
    try {
      return await fn({
        get: async () => {
          const v = await this.redis.get(`${this.key}:next`);
          return v === null ? null : Number(v);
        },
        set: async (n) => {
          await this.redis.set(`${this.key}:next`, String(n));
        },
      });
    } finally {
      // Release only if we still own it.
      await this.redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        lockKey,
        token,
      );
    }
  }
}

export type SentTx = {
  hash: string;
  replaced: string[];
  nonce: number;
  receipt: TransactionReceipt;
  feeWei: bigint;
  maxFeePerGas: bigint;
};

const MIN_TIP = parseUnits("1", "gwei");
const BUMP_NUM = 125n; // +25% per replacement (nodes require ≥ +10%)
const MAX_BUMPS = 3;

export class TxSender {
  constructor(
    private readonly wallet: Wallet,
    private readonly lock: NonceLock,
    private readonly logger: Logger,
    private readonly bumpAfterMs: number,
    private readonly onBroadcast?: (hash: string, nonce: number) => Promise<void>,
  ) {}

  get address() {
    return this.wallet.address;
  }

  /** Broadcast with a fresh nonce; if not mined within `bumpAfterMs`, re-send at the same nonce with higher fees. */
  async send(tx: TransactionRequest): Promise<SentTx> {
    const provider = this.wallet.provider!;
    const fee = await provider.getFeeData();
    let tip = fee.maxPriorityFeePerGas && fee.maxPriorityFeePerGas > MIN_TIP ? fee.maxPriorityFeePerGas : MIN_TIP;
    let maxFee = (fee.maxFeePerGas ?? tip) > tip ? fee.maxFeePerGas! : tip * 2n;
    const gasLimit = tx.gasLimit ?? ((await this.wallet.estimateGas(tx)) * 12n) / 10n;

    const { nonce, hash: first } = await this.lock.withLock(async (next) => {
      const pending = await provider.getTransactionCount(this.wallet.address, "pending");
      const hinted = await next.get();
      const nonce = Math.max(pending, hinted ?? 0);
      const sent = await this.wallet.sendTransaction({
        ...tx,
        nonce,
        gasLimit,
        type: 2,
        maxPriorityFeePerGas: tip,
        maxFeePerGas: maxFee,
      });
      await next.set(nonce + 1);
      return { nonce, hash: sent.hash };
    });
    await this.onBroadcast?.(first, nonce);

    const hashes = [first];
    for (let bump = 0; ; bump++) {
      const receipt = await this.waitAny(hashes, this.bumpAfterMs);
      if (receipt) {
        const feeWei = receipt.gasUsed * (receipt.gasPrice ?? maxFee);
        return { hash: receipt.hash, replaced: hashes.filter((h) => h !== receipt.hash), nonce, receipt, feeWei, maxFeePerGas: maxFee };
      }
      if (bump >= MAX_BUMPS) throw new Error(`Tx ${first} not mined after ${MAX_BUMPS} gas bumps`);
      tip = (tip * BUMP_NUM) / 100n;
      maxFee = (maxFee * BUMP_NUM) / 100n;
      this.logger.warn({ nonce, bump: bump + 1, tip: tip.toString() }, "Relayer tx stuck — replacing by nonce");
      try {
        const replacement = await this.wallet.sendTransaction({
          ...tx,
          nonce,
          gasLimit,
          type: 2,
          maxPriorityFeePerGas: tip,
          maxFeePerGas: maxFee,
        });
        hashes.push(replacement.hash);
        await this.onBroadcast?.(replacement.hash, nonce);
      } catch (err) {
        // "nonce too low" means one of the earlier hashes was mined meanwhile — loop and pick it up.
        this.logger.warn({ err: (err as Error).message }, "Replacement broadcast failed");
      }
    }
  }

  private async waitAny(hashes: string[], timeoutMs: number): Promise<TransactionReceipt | null> {
    const provider = this.wallet.provider!;
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      for (const h of hashes) {
        const r = await provider.getTransactionReceipt(h);
        if (r) return r;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return null;
  }
}
