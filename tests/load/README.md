# Load tests

`k6-load.js` covers the Phase 6 quality gate: **500 concurrent citizen readers and 20 grievance
writes per minute**, with thresholds that fail the run (p95 read < 800 ms, < 1 % read errors, p95
write-accept < 1.5 s, relay confirmation p95 < 60 s).

```bash
brew install k6            # or: docker run --rm -i grafana/k6 run - < tests/load/k6-load.js
k6 run -e BASE_URL=https://staging.example.org tests/load/k6-load.js
```

| Variable | Default | Meaning |
|---|---|---|
| `BASE_URL` | `http://localhost:5173` | web origin (proxies `/api`) |
| `READERS` | `500` | peak concurrent readers |
| `DURATION` | `5m` | steady-state duration |
| `WRITES` | `20` | grievances per minute (`0` disables) |

**Writes are real transactions** paid by the relayer. Point them at a dedicated staging/load stack on
MST testnet running with `NS_DEMO_MODE=true` (relaxes per-IP and OTP limits and returns the one-time
code so k6 can sign demo citizens in). Never aim the writer at production or mainnet.

For a quick smoke against a local `pnpm demo`:

```bash
k6 run -e READERS=25 -e DURATION=30s -e WRITES=6 tests/load/k6-load.js
```

Record results in `docs/pilot/load-test-results.md` (template there) after each staging run.
