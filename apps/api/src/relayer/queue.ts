// Relayer job queue: BullMQ on Redis (retries survive restarts), or an in-process queue for
// development and tests without Redis.
import { Queue, UnrecoverableError, Worker, type ConnectionOptions } from "bullmq";
import type { Logger } from "pino";

export type RelayJobData =
  | { jobId: string; kind: "grievance"; citizenHash: string; projectId: number; category: number; cid: string }
  | { jobId: string; kind: "upvote"; citizenHash: string; grievanceId: number };

export type Processor = (data: RelayJobData, attempt: number) => Promise<void>;
/** Called once a job has failed for good. */
export type OnFailed = (data: RelayJobData, err: Error) => Promise<void>;

/** Throw to fail a job without retrying (e.g. an on-chain revert — retrying would revert again). */
export class PermanentError extends UnrecoverableError {}

export interface JobQueue {
  add(data: RelayJobData): Promise<void>;
  close(): Promise<void>;
}

const QUEUE_NAME = "ns-relayer";
const ATTEMPTS = 3;

export class BullJobQueue implements JobQueue {
  private readonly queue: Queue<RelayJobData>;
  private readonly worker: Worker<RelayJobData>;

  constructor(connection: ConnectionOptions, processor: Processor, onFailed: OnFailed, logger: Logger, concurrency = 4) {
    this.queue = new Queue<RelayJobData>(QUEUE_NAME, { connection });
    this.worker = new Worker<RelayJobData>(QUEUE_NAME, (job) => processor(job.data, job.attemptsMade + 1), {
      connection,
      concurrency,
    });
    this.worker.on("failed", (job, err) => {
      if (!job) return;
      const final = err instanceof UnrecoverableError || job.attemptsMade >= ATTEMPTS;
      logger.warn({ jobId: job.data.jobId, attempt: job.attemptsMade, final, err: err.message }, "Relay job failed");
      if (final) void onFailed(job.data, err);
    });
  }

  async add(data: RelayJobData) {
    await this.queue.add(data.kind, data, {
      jobId: data.jobId,
      attempts: ATTEMPTS,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }

  async close() {
    await this.worker.close();
    await this.queue.close();
  }
}

export class MemoryJobQueue implements JobQueue {
  private readonly running = new Set<Promise<void>>();

  constructor(
    private readonly processor: Processor,
    private readonly onFailed: OnFailed,
    private readonly logger: Logger,
  ) {}

  async add(data: RelayJobData) {
    const run = (async () => {
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
          await this.processor(data, attempt);
          return;
        } catch (err) {
          const final = err instanceof UnrecoverableError || attempt === ATTEMPTS;
          this.logger.warn({ jobId: data.jobId, attempt, final, err: (err as Error).message }, "Relay job failed");
          if (final) return this.onFailed(data, err as Error);
        }
      }
    })();
    this.running.add(run);
    void run.finally(() => this.running.delete(run));
  }

  /** Resolves when every queued job has settled (tests). */
  async drain() {
    while (this.running.size) await Promise.allSettled([...this.running]);
  }

  async close() {
    await this.drain();
  }
}
