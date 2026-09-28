// The indexer runs as its own process, so it hands notifications to the API process through
// Postgres LISTEN/NOTIFY; the API fans them out over Socket.IO (src/socket).
import { sql, type Db } from "@namma-seva/db";
import type { Touched } from "./projections";

export const NOTIFY_CHANNEL = "ns_chain";

export type IndexerNotification =
  | ({ type: "entity" } & Touched)
  | { type: "pending"; txHash: string; contract: string; eventName: string; args: Record<string, unknown> }
  | { type: "tx"; txHash: string; status: string; kind: string; entityId: string | null; blockNumber: number | null }
  | { type: "head"; head: number; safeHead: number; indexed: number }
  | { type: "reorg"; toBlock: number };

export interface NotificationSink {
  publish(notes: IndexerNotification[]): Promise<void>;
}

/** Postgres caps NOTIFY payloads at 8000 bytes; stay well under it. */
const MAX_PAYLOAD = 7000;

export function chunkNotifications(notes: IndexerNotification[]): string[] {
  const chunks: string[] = [];
  let current: IndexerNotification[] = [];
  let size = 2;
  for (const n of notes) {
    const len = JSON.stringify(n).length + 1;
    if (len > MAX_PAYLOAD) continue; // a single oversized note (huge args) is dropped; the ledger has it
    if (size + len > MAX_PAYLOAD && current.length) {
      chunks.push(JSON.stringify(current));
      current = [];
      size = 2;
    }
    current.push(n);
    size += len;
  }
  if (current.length) chunks.push(JSON.stringify(current));
  return chunks;
}

export class PgNotifySink implements NotificationSink {
  constructor(private readonly db: Db) {}

  async publish(notes: IndexerNotification[]) {
    for (const payload of chunkNotifications(notes)) {
      await this.db.execute(sql`SELECT pg_notify(${NOTIFY_CHANNEL}, ${payload})`);
    }
  }
}

/** In-process sink for tests and single-process demo mode. */
export class MemorySink implements NotificationSink {
  readonly received: IndexerNotification[] = [];
  private listeners: ((n: IndexerNotification[]) => void)[] = [];

  async publish(notes: IndexerNotification[]) {
    this.received.push(...notes);
    for (const l of this.listeners) l(notes);
  }

  subscribe(listener: (n: IndexerNotification[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}
