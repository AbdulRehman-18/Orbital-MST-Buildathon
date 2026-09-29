# One-week staging soak (MST testnet)

Purpose: find the failures that only appear over time — memory growth, indexer drift, nonce collisions, expired credentials, RPC hiccups, backup/restore, alert noise. Run on **staging** = a separate MST-testnet deployment ("dev" and "staging" have separate contracts), production-like config (Redis, KMS or hot testnet key, Nginx tier, monitoring, backups), `NS_DEMO_MODE` off.

## Setup
- [ ] Fresh contract deployment on testnet ([`deploy-mst-testnet.md`](../runbooks/deploy-mst-testnet.md)) using the release candidate; roles granted.
- [ ] Compose stack with `--profile observability`; alerts routed to a real channel; backups on.
- [ ] Synthetic traffic: `k6` reads at ~50 VUs continuously; a script creates a project → milestone → proof → approvals → release and a grievance every 30 minutes with throwaway wallets (`smoke:mst-testnet` in a loop).
- [ ] A calendar of planned disturbances (below).

## Planned disturbances (days 2–6)
| Day | Disturbance | Expected |
|---|---|---|
| 2 | Restart API, then indexer, during a transaction | no lost/duplicated events; `indexer_lag_blocks` recovers; pending tx resolves |
| 3 | Block the primary RPC for 10 min | fallback RPC used or `RpcDown` alert; indexer resumes without gaps |
| 3 | Drain the relayer below 10 MSTC, then to 2 | `RelayerLowBalance` then `Critical`; top-up restores service |
| 4 | Kill Redis for 2 min | API degrades gracefully (in-flight limits fall back), no data loss; queue resumes |
| 5 | Run a **pause/unpause drill** with the real owners | pause < 15 min; resume through the timelock |
| 6 | Restore drill from last night's backup | `restore-test.sh` green; row counts match |

## Daily checks
`/api/ready` green; no unresolved alerts older than 1 h; `tx_failures_total` flat; indexer checksum stable after a rebuild on a scratch DB; disk and memory trend flat (no leak); 5xx rate < 0.5 %; a11y suite still green against staging.

## Pass criteria
No SEV1/SEV2; every alert that fired was expected and resolved within its runbook time; no unexplained data divergence; memory/CPU flat within ±10 % after day 1; all disturbances recovered without manual DB edits.

## Log
| Day | Date | Checks | Disturbance | Notes / defects |
|---|---|---|---|---|
| 1 | | | — | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | — | verdict: ☐ PASS ☐ FAIL |
