import { relayerTxs, type Db } from "@namma-seva/db";
import { createTestDb } from "@namma-seva/db/testing";
import { id, verifyTypedData, Wallet } from "ethers";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { deriveCitizenWallet, FORWARD_REQUEST_TYPES, forwarderDomain, signForwardRequest } from "../src/relayer/forwarder";
import { MemoryJobQueue, PermanentError, type RelayJobData } from "../src/relayer/queue";
import { Relayer, RelayerError } from "../src/relayer/relayer";
import { MemoryNonceLock, type TxSender } from "../src/relayer/sender";
import { TEST_ENV } from "./helpers/app";
import { FakeChain } from "./helpers/fake-chain";

const logger = pino({ level: "silent" });
const ROOT_KEY = "0x" + "11".repeat(32);

describe("citizen keys & forward requests", () => {
  it("derives a stable, distinct key per citizen", () => {
    const a1 = deriveCitizenWallet(ROOT_KEY, id("a"));
    const a2 = deriveCitizenWallet(ROOT_KEY, id("a"));
    const b = deriveCitizenWallet(ROOT_KEY, id("b"));
    const otherRoot = deriveCitizenWallet("0x" + "22".repeat(32), id("a"));
    expect(a1.address).toBe(a2.address);
    expect(new Set([a1.address, b.address, otherRoot.address]).size).toBe(3);
    expect(a1.address).not.toBe(new Wallet(ROOT_KEY).address);
  });

  it("signs EIP-712 ForwardRequests the forwarder can verify", async () => {
    const signer = deriveCitizenWallet(ROOT_KEY, id("a"));
    const domain = forwarderDomain(91562037, "0x00000000000000000000000000000000000000a6");
    const req = await signForwardRequest(signer, domain, {
      to: "0x00000000000000000000000000000000000000a4",
      data: "0x1234",
      gas: 400_000n,
      nonce: 7n,
      deadline: 1_800_000_000,
    });
    const recovered = verifyTypedData(
      domain,
      FORWARD_REQUEST_TYPES,
      { from: req.from, to: req.to, value: 0n, gas: req.gas, nonce: 7n, deadline: req.deadline, data: req.data },
      req.signature,
    );
    expect(recovered).toBe(signer.address);
  });
});

describe("nonce lock", () => {
  it("serialises critical sections and hands out consecutive nonces", async () => {
    const lock = new MemoryNonceLock();
    const got: number[] = [];
    await Promise.all(
      Array.from({ length: 10 }, () =>
        lock.withLock(async (next) => {
          const n = (await next.get()) ?? 0;
          await new Promise((r) => setTimeout(r, Math.random() * 5));
          got.push(n);
          await next.set(n + 1);
        }),
      ),
    );
    expect(got).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe("relayer guards & queue", () => {
  let db: Db;
  let close: () => Promise<void>;
  let chain: FakeChain;
  let relayer: Relayer;
  let processed: RelayJobData[];
  let queue: MemoryJobQueue;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    chain = new FakeChain();
    processed = [];
    relayer = new Relayer({
      db,
      provider: chain.provider,
      contracts: chain.contracts,
      chainId: 31337,
      rootPrivateKey: ROOT_KEY,
      sender: { address: "0x00000000000000000000000000000000000000ff" } as TxSender,
      logger,
      minBalance: "10",
      dailyCap: "1",
      citizenDailyLimit: 3,
    });
    queue = new MemoryJobQueue(
      async (data) => {
        processed.push(data);
        if (data.kind === "upvote" && data.grievanceId === 99) throw new PermanentError("AlreadyUpvoted(99)");
      },
      relayer.onFailed,
      logger,
    );
    relayer.queue = queue;
  });
  afterEach(async () => {
    await close();
  });

  it("queues jobs and records their status", async () => {
    const job = await relayer.enqueueGrievance("u1", id("a"), { projectId: 1, category: 0, cid: "bafygrv" });
    expect(job).toMatchObject({ kind: "grievance", status: "queued", cid: "bafygrv" });
    await queue.drain();
    expect(processed).toHaveLength(1);
    expect(await relayer.jobOwner(job.jobId)).toBe("u1");
  });

  it("marks permanently failing jobs as failed without retrying", async () => {
    const job = await relayer.enqueueUpvote("u1", id("a"), 99);
    await queue.drain();
    expect(processed).toHaveLength(1);
    expect(await relayer.job(job.jobId)).toMatchObject({ status: "failed", error: "AlreadyUpvoted(99)" });
  });

  it("enforces the per-citizen daily limit", async () => {
    for (let i = 0; i < 3; i++) await relayer.enqueueUpvote("u1", id("a"), i + 1);
    await expect(relayer.enqueueUpvote("u1", id("a"), 10)).rejects.toMatchObject({ status: 429 });
    await expect(relayer.enqueueUpvote("u2", id("b"), 10)).resolves.toMatchObject({ status: "queued" });
  });

  it("pauses when the daily spend cap is reached or the wallet is empty", async () => {
    await db.insert(relayerTxs).values({ jobId: "x", kind: "grievance", status: "confirmed", feeWei: (10n ** 18n).toString() });
    await expect(relayer.enqueueUpvote("u1", id("a"), 1)).rejects.toBeInstanceOf(RelayerError);
    await db.delete(relayerTxs);
    chain.balance = 0n;
    await relayer.refreshBalance();
    await expect(relayer.enqueueUpvote("u1", id("a"), 1)).rejects.toMatchObject({ status: 503 });
  });

  it("reports balance and flags it when below the floor", async () => {
    chain.balance = 5n * 10n ** 18n;
    expect(await relayer.status()).toMatchObject({ balance: "5.0", low: true, spentToday: "0.0", dailyCap: "1" });
  });
});

describe("config guards", () => {
  it("refuses legacy per-role private keys", () => {
    expect(() => loadConfig({ ...TEST_ENV, PRIVKEY_AUDITOR_1: "0xabc" })).toThrow(/PRIVKEY_AUDITOR_1/);
  });

  it("requires secrets and forbids demo/console OTP in production", () => {
    const prod = {
      ...TEST_ENV,
      NODE_ENV: "production",
      DATABASE_URL: "postgres://x",
      REDIS_URL: "redis://x",
      OTP_PROVIDER: "msg91",
    };
    expect(() => loadConfig(prod)).not.toThrow();
    expect(() => loadConfig({ ...prod, REDIS_URL: "" })).toThrow(/REDIS_URL/);
    expect(() => loadConfig({ ...prod, NS_DEMO_MODE: "true" })).toThrow(/NS_DEMO_MODE/);
    expect(() => loadConfig({ ...prod, OTP_PROVIDER: "console" })).toThrow(/console/);
    expect(() => loadConfig({ ...prod, DEPLOYER_PRIVATE_KEY: "0x1" })).toThrow(/DEPLOYER_PRIVATE_KEY/);
    expect(() => loadConfig({ ...TEST_ENV, NS_CHAIN: "polygonAmoy" })).toThrow(/NS_CHAIN/);
  });

  it("splits MST_RPC_URLS for the fallback provider", () => {
    const c = loadConfig({ ...TEST_ENV, NS_CHAIN: "mstMainnet", MST_RPC_URLS: "https://a, https://b" });
    expect(c.chain.rpcUrls).toEqual(["https://a", "https://b"]);
    expect(c.network.id).toBe(4646);
    expect(loadConfig({ ...TEST_ENV, NS_CHAIN: "mstTestnet" }).chain.rpcUrls).toEqual(["https://testnetrpc.mstblockchain.com"]);
  });
});
