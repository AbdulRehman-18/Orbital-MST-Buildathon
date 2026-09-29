// Minimal Prometheus registry (text exposition format 0.0.4) — enough for the four alerting
// signals in plan §18.3 without pulling in a dependency: indexer_lag_blocks, relayer_balance,
// tx_failures_total, rpc_latency_ms — plus HTTP request counters.

type Labels = Record<string, string>;

const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
const key = (labels: Labels) =>
  Object.keys(labels)
    .sort()
    .map((k) => `${k}="${esc(labels[k])}"`)
    .join(",");
const line = (name: string, k: string, value: number) => `${name}${k ? `{${k}}` : ""} ${Number.isFinite(value) ? value : "NaN"}`;

abstract class Metric {
  constructor(
    readonly name: string,
    readonly help: string,
    readonly type: "counter" | "gauge" | "histogram",
  ) {}
  abstract lines(): string[];
  render(): string {
    return [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} ${this.type}`, ...this.lines()].join("\n");
  }
}

export class Counter extends Metric {
  private readonly values = new Map<string, number>();
  constructor(name: string, help: string) {
    super(name, help, "counter");
  }
  inc(labels: Labels = {}, by = 1) {
    const k = key(labels);
    this.values.set(k, (this.values.get(k) ?? 0) + by);
  }
  lines() {
    // A never-incremented counter still reports 0 so `rate()` and absence alerts behave.
    if (this.values.size === 0) return [line(this.name, "", 0)];
    return [...this.values].map(([k, v]) => line(this.name, k, v));
  }
  reset() {
    this.values.clear();
  }
}

export class Gauge extends Metric {
  private readonly values = new Map<string, number>();
  constructor(name: string, help: string) {
    super(name, help, "gauge");
  }
  set(value: number, labels: Labels = {}) {
    this.values.set(key(labels), value);
  }
  /** Drop a series that no longer has a value (e.g. the indexer has not reported yet). */
  clear() {
    this.values.clear();
  }
  lines() {
    return [...this.values].map(([k, v]) => line(this.name, k, v));
  }
}

export class Histogram extends Metric {
  private readonly series = new Map<string, { buckets: number[]; sum: number; count: number }>();
  constructor(
    name: string,
    help: string,
    private readonly bounds: number[],
  ) {
    super(name, help, "histogram");
  }
  observe(value: number, labels: Labels = {}) {
    const k = key(labels);
    let s = this.series.get(k);
    if (!s) this.series.set(k, (s = { buckets: this.bounds.map(() => 0), sum: 0, count: 0 }));
    this.bounds.forEach((b, i) => {
      if (value <= b) s.buckets[i]++;
    });
    s.sum += value;
    s.count++;
  }
  lines() {
    const out: string[] = [];
    for (const [k, s] of this.series) {
      const sep = k ? `${k},` : "";
      this.bounds.forEach((b, i) => out.push(line(`${this.name}_bucket`, `${sep}le="${b}"`, s.buckets[i])));
      out.push(line(`${this.name}_bucket`, `${sep}le="+Inf"`, s.count));
      out.push(line(`${this.name}_sum`, k, s.sum));
      out.push(line(`${this.name}_count`, k, s.count));
    }
    return out;
  }
}

const LATENCY_MS = [25, 50, 100, 250, 500, 1000, 2500, 5000];

/** Process-wide registry. Tests may call `metrics.reset()`. */
export const metrics = {
  indexerLagBlocks: new Gauge("indexer_lag_blocks", "Blocks between the chain head and the last block the indexer processed."),
  indexerLastUpdateSeconds: new Gauge("indexer_last_update_age_seconds", "Seconds since the indexer last wrote its cursor."),
  relayerBalance: new Gauge("relayer_balance", "Relayer native-coin balance (MSTC)."),
  relayerSpentToday: new Gauge("relayer_spent_today", "Relayer gas spent since 00:00 UTC (MSTC)."),
  txFailures: new Counter("tx_failures_total", "Relayer jobs that failed for good, by kind."),
  rpcLatency: new Histogram("rpc_latency_ms", "Latency of an eth_blockNumber probe against the configured RPC.", LATENCY_MS),
  rpcUp: new Gauge("rpc_up", "1 if the last RPC probe succeeded."),
  httpRequests: new Counter("http_requests_total", "HTTP requests handled, by method, route and status."),
  httpDuration: new Histogram("http_request_duration_ms", "HTTP request latency.", LATENCY_MS),
  buildInfo: new Gauge("namma_seva_build_info", "Constant 1, labelled with the chain this process serves."),
  reset() {
    this.txFailures.reset();
    this.httpRequests.reset();
  },
  render(): string {
    const all: Metric[] = [
      this.indexerLagBlocks,
      this.indexerLastUpdateSeconds,
      this.relayerBalance,
      this.relayerSpentToday,
      this.txFailures,
      this.rpcLatency,
      this.rpcUp,
      this.httpRequests,
      this.httpDuration,
      this.buildInfo,
    ];
    return all.map((m) => m.render()).join("\n\n") + "\n";
  },
};
