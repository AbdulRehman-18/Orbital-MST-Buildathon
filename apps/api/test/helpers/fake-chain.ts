// Deterministic in-memory chain for indexer tests: blocks, logs from our real ABIs, reorgs, and
// injectable getLogs failures. Implements only the Provider surface the indexer uses.
import type { Deployment } from "@namma-seva/chain";
import { id, type Log, type Provider } from "ethers";
import { interfaces, resolveContracts, type ChainContracts } from "../../src/chain/contracts";

type ContractKey = keyof typeof interfaces;

const ADDR: Record<ContractKey, string> = {
  NammaSevaAccess: "0x00000000000000000000000000000000000000a1",
  ProjectRegistry: "0x00000000000000000000000000000000000000a2",
  MilestoneEscrow: "0x00000000000000000000000000000000000000a3",
  GrievanceRegistry: "0x00000000000000000000000000000000000000a4",
  TenderRegistry: "0x00000000000000000000000000000000000000a5",
  TrustedForwarder: "0x00000000000000000000000000000000000000a6",
};

export const START_BLOCK = 10;

export function fakeDeployment(): Deployment {
  return {
    network: "test",
    chainId: 31337,
    blockNumber: START_BLOCK,
    commit: "test",
    deployedAt: "2026-01-01T00:00:00Z",
    deployer: "0x0000000000000000000000000000000000000001",
    mode: "LEDGER",
    contracts: Object.fromEntries(Object.entries(ADDR).map(([k, address]) => [k, { address }])) as Deployment["contracts"],
  };
}

type FakeLog = { contract: ContractKey; event: string; args: unknown[]; txHash: string };
type Block = { number: number; hash: string; timestamp: number; logs: FakeLog[] };

export class FakeChain {
  readonly contracts: ChainContracts = resolveContracts(fakeDeployment());
  private blocks: Block[] = [];
  private fork = 0;
  private txCounter = 0;
  /** getLogs rejects ranges wider than this (simulates RPC range limits). */
  maxLogRange = Infinity;
  getLogsCalls = 0;
  balance = 100n * 10n ** 18n;
  /** eth_call stubs keyed "Contract.function". */
  calls = new Map<string, (args: unknown[]) => unknown[]>();

  stubCall(contract: ContractKey, fn: string, impl: (args: unknown[]) => unknown[]) {
    this.calls.set(`${contract}.${fn}`, impl);
  }
  receipts = new Map<string, { status: number; blockNumber: number }>();

  constructor(genesisBlocks = START_BLOCK) {
    for (let i = 0; i < genesisBlocks; i++) this.mine();
  }

  get head() {
    return this.blocks.length - 1;
  }

  /** Mine one block containing `logs`; returns the block number. */
  mine(logs: Omit<FakeLog, "txHash">[] = [], txHash?: string): number {
    const number = this.blocks.length;
    const block: Block = {
      number,
      hash: id(`block-${number}-fork-${this.fork}`),
      timestamp: 1_760_000_000 + number * 3,
      logs: logs.map((l) => ({ ...l, txHash: txHash ?? id(`tx-${++this.txCounter}-fork-${this.fork}`) })),
    };
    this.blocks.push(block);
    for (const l of block.logs) this.receipts.set(l.txHash, { status: 1, blockNumber: number });
    return number;
  }

  mineEmpty(n: number) {
    for (let i = 0; i < n; i++) this.mine();
  }

  /** Replace every block from `fromBlock` with a new (empty) fork. */
  reorg(fromBlock: number) {
    this.fork++;
    const dropped = this.blocks.splice(fromBlock);
    for (const b of dropped) for (const l of b.logs) this.receipts.delete(l.txHash);
    for (let i = 0; i < dropped.length; i++) this.mine();
  }

  ev(contract: ContractKey, event: string, ...args: unknown[]): Omit<FakeLog, "txHash"> {
    return { contract, event, args };
  }

  private toLog(block: Block, l: FakeLog, index: number): Log {
    const iface = interfaces[l.contract];
    const { data, topics } = iface.encodeEventLog(iface.getEvent(l.event)!, l.args);
    return {
      address: ADDR[l.contract],
      topics,
      data,
      blockNumber: block.number,
      blockHash: block.hash,
      transactionHash: l.txHash,
      index,
      transactionIndex: 0,
      removed: false,
    } as unknown as Log;
  }

  readonly provider = {
    getBlockNumber: async () => this.head,
    getBlock: async (n: number | string) => {
      const b = n === "latest" ? this.blocks[this.head] : this.blocks[Number(n)];
      return b ? { number: b.number, hash: b.hash, timestamp: b.timestamp } : null;
    },
    getLogs: async (filter: { address: string[]; fromBlock: number; toBlock: number }) => {
      this.getLogsCalls++;
      if (filter.toBlock - filter.fromBlock + 1 > this.maxLogRange) throw new Error("query returned more than 10000 results");
      const wanted = new Set(filter.address.map((a) => a.toLowerCase()));
      const out: Log[] = [];
      for (let n = filter.fromBlock; n <= Math.min(filter.toBlock, this.head); n++) {
        this.blocks[n].logs.forEach((l, i) => {
          if (wanted.has(ADDR[l.contract])) out.push(this.toLog(this.blocks[n], l, i));
        });
      }
      return out;
    },
    getTransactionReceipt: async (hash: string) => this.receipts.get(hash) ?? null,
    getBalance: async () => this.balance,
    call: async (tx: { to: string; data: string }) => {
      const contract = (Object.keys(ADDR) as ContractKey[]).find((k) => ADDR[k] === String(tx.to).toLowerCase());
      if (!contract) throw new Error(`call to unknown address ${tx.to}`);
      const iface = interfaces[contract];
      const parsed = iface.parseTransaction({ data: tx.data })!;
      const impl = this.calls.get(`${contract}.${parsed.name}`);
      if (!impl) throw new Error(`no stub for ${contract}.${parsed.name}`);
      return iface.encodeFunctionResult(parsed.fragment, impl([...parsed.args]));
    },
  } as unknown as Provider;
}

export const ZERO = "0x0000000000000000000000000000000000000000";
export const OFFICIAL = "0x1111111111111111111111111111111111111111";
export const AUDITOR_1 = "0x2222222222222222222222222222222222222222";
export const AUDITOR_2 = "0x3333333333333333333333333333333333333333";
export const CONTRACTOR = "0x4444444444444444444444444444444444444444";
export const CITIZEN_A = id("citizen-a");
export const CITIZEN_B = id("citizen-b");

/** A realistic lifecycle: project → approvals → milestone → proof → approvals → payout, plus a grievance and a tender. */
export function seedLifecycle(chain: FakeChain) {
  const c = chain;
  c.mine([c.ev("NammaSevaAccess", "RoleGranted", id("GOVT_OFFICIAL"), OFFICIAL, OFFICIAL)]);
  c.mine([c.ev("NammaSevaAccess", "WardAccessSet", OFFICIAL, 42, true)]);
  c.mine([
    c.ev("ProjectRegistry", "ProjectCreated", 1, OFFICIAL, 42, id("meta-1"), "bafymeta1", 0, 1, 12_971_600, 77_594_600,
      5_000_000n, 1_760_000_000, 1_790_000_000, ZERO, 2),
  ]);
  c.mine([c.ev("ProjectRegistry", "ProjectApproved", 1, AUDITOR_1, 1)]);
  c.mine([
    c.ev("ProjectRegistry", "ProjectApproved", 1, AUDITOR_2, 2),
    c.ev("ProjectRegistry", "ProjectStatusChanged", 1, 1),
  ]);
  c.mine([c.ev("ProjectRegistry", "ContractorAssigned", 1, CONTRACTOR, OFFICIAL)]);
  c.mine([c.ev("MilestoneEscrow", "ProjectFunded", 1, OFFICIAL, 3_000_000n, id("sanction"), 3_000_000n)]);
  c.mine([
    c.ev("MilestoneEscrow", "MilestoneCreated", 1, 1, id("ms-1"), "bafyms1", 2_000_000n),
    c.ev("ProjectRegistry", "MilestoneCountUpdated", 1, 1),
  ]);
  c.mine([
    c.ev("MilestoneEscrow", "ProofSubmitted", 1, 1, CONTRACTOR, "bafyproof1", id("proof-1"), 12_971_650, 77_594_620, 0),
    c.ev("MilestoneEscrow", "MilestoneStatusChanged", 1, 1, 1),
  ]);
  c.mine([c.ev("MilestoneEscrow", "MilestoneApproved", 1, 1, AUDITOR_1, 1, 0)]);
  c.mine([
    c.ev("MilestoneEscrow", "MilestoneApproved", 1, 1, AUDITOR_2, 2, 0),
    c.ev("MilestoneEscrow", "MilestoneStatusChanged", 1, 1, 2),
  ]);
  c.mine([
    c.ev("ProjectRegistry", "SpentUpdated", 1, 2_000_000n),
    c.ev("MilestoneEscrow", "MilestoneStatusChanged", 1, 1, 4),
    c.ev("MilestoneEscrow", "FundsReleased", 1, 1, CONTRACTOR, 2_000_000n, id("utr")),
  ]);
  c.mine([c.ev("GrievanceRegistry", "GrievanceFiled", 1, 1, CITIZEN_A, 0, "bafygrv1")]);
  c.mine([c.ev("GrievanceRegistry", "GrievanceUpvoted", 1, 1, CITIZEN_B, 1)]);
  c.mine([
    c.ev("TenderRegistry", "TenderPublished", 1, 1, OFFICIAL, "bafytender1", 1_760_100_000, 1_760_200_000),
  ]);
  c.mine([c.ev("TenderRegistry", "BidCommitted", 1, CONTRACTOR, id("commit"))]);
}
