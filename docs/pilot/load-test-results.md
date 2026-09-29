# Load test results

Script: [`tests/load/k6-load.js`](../../tests/load/k6-load.js) · Gate: **500 concurrent citizen readers + 20 grievance writes/minute** · Thresholds: read p95 < 800 ms and p99 < 2 s, read errors < 1 %, write-accept p95 < 1.5 s, relay confirmation p95 < 60 s.

| Run | Date | Environment (commit, instances, DB size) | Readers / writes | Read p95 / p99 | Read err | Write accept p95 | Relay confirm p95 | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | | | 500 / 20 | | | | | |

Attach the k6 summary. Note the bottleneck if it failed (API CPU, Postgres connections — pool is 10 per process, Redis, RPC), what you changed, and re-run. Only a passing run against the release candidate counts for the go/no-go.
