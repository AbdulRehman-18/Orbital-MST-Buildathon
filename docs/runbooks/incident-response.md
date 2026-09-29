# Runbook — incident response (and CERT-In reporting)

## Roles
- **Incident commander (IC)** — decides severity, owns the timeline, the only person who declares "resolved".
- **Technical lead** — investigates and fixes. **Scribe** — keeps the timeline. **Comms** — talks to the ward/ULB and, when needed, the public.
Names, phone numbers and the three reachable multisig owners live in the on-call sheet (`docs/pilot/pilot-plan.md` §On-call). Keep it printed; do not rely on the systems that may be down.

## Severity
| | Examples | Response |
|---|---|---|
| **SEV1** | funds at risk; key compromise in use; data breach; site serving wrong/forged data | page immediately; consider **pause**; **CERT-In within 6 h** |
| **SEV2** | indexer stalled > 15 min, relayer out of gas, API down, RPC down | page; fix; no CERT-In unless it turns out to be an attack |
| **SEV3** | degraded latency, single failed job, warning alerts | next working day |

## The first 30 minutes
1. IC declares severity in the incident channel; Scribe starts the timeline (UTC + IST).
2. **Preserve evidence** before "fixing": snapshot the logs (`docker compose logs --since 24h > incident-<id>.log`), note the current block number, keep the failing containers, copy relevant DB rows. Never delete logs.
3. Contain: revoke the credential, block the source, **pause** the contracts if money or roles are at stake ([pause-and-resume.md](pause-and-resume.md)), or take the web tier to a static maintenance page.
4. Communicate: one status line to the ward/ULB contact and (SEV1) the owners.

## CERT-In reporting (6 hours)
The CERT-In Directions (28 April 2022) require reporting of specified cyber incidents — including compromise of critical systems, data breaches, data leaks, attacks on servers/applications and unauthorised access — **within 6 hours of noticing** them.
1. Clock starts when the incident is *noticed*, not when it is confirmed. The Scribe writes the notice time.
2. Comms/IC files at **incident@cert-in.org.in** (and the CERT-In web form/phone listed at https://www.cert-in.org.in) using the template in [`docs/compliance/cert-in.md`](../compliance/cert-in.md#report-template). File what you know; update later.
3. Also notify the nodal/ULB officer and, for a **personal data breach**, the Data Protection Board of India and affected people as the DPDP Act and Rules require ([`docs/compliance/dpdp.md`](../compliance/dpdp.md#breach-notification)).
4. Keep the acknowledgement number in the timeline.

## Symptoms and fixes
### Indexer lag
Alerts `IndexerLagging`, `IndexerLagCritical`, `IndexerStalled`. Citizens see stale data; **no funds at risk**.
- `docker compose … logs --tail 100 indexer`. Common causes: RPC unreachable / range limits (batch size halves automatically — ADR 0004); DB lock; crash loop.
- Restart: `docker compose … restart indexer`. Exactly one indexer runs (advisory lock) — do not start a second by hand.
- Persistent errors decoding an event: do **not** skip it; fix the decoder and redeploy — the cursor resumes where it stopped.
- If the read model looks wrong: `indexer:rebuild` ([backup-restore.md](backup-restore.md#last-resort-rebuild-from-chain)).

### RPC
Alerts `RpcDown`, `RpcSlow`. `MST_RPC_URLS` accepts several endpoints (quorum-1 fallback with a 2 s stall). Add another public MST RPC or a dedicated node; check https://mstscan.com status. A reorg deeper than `REORG_DEPTH` (64) is treated as a chain incident — pause and escalate.

### Relayer
Alerts `RelayerLowBalance`, `RelayerBalanceCritical`, `RelayerFailures`. Top up ([relayer-key-rotation.md](relayer-key-rotation.md#funding)); check `tx_failures_total{kind}` and `select status,error,count(*) from relayer_txs where created_at > now() - interval '1 hour' group by 1,2;`. Reverts like `AlreadyUpvoted` are user errors, not incidents. Mass failures with `SystemPaused` mean the system is paused.

### API
Alerts `ApiDown`, `ApiErrorRate`, `ApiSlow`. `/api/health` (liveness) vs `/api/ready` (DB + RPC + indexer < 60 s). Roll back the last release ([upgrade.md](upgrade.md#a-application-rollout-api-indexer-web--routine)). 429s from Nginx mean a burst or abuse — check `limit_req` counters, block the source at the edge.

### Suspected data exposure
Treat as SEV1. Rotate `JWT_SECRET` (signs everyone out), review `audit_log`, identify the window and records, follow DPDP breach steps. Remember what is **not** at risk: no PII is on-chain; phone numbers are stored only as peppered hashes.

## After
Post-incident review within 5 working days, blameless: timeline, root cause, what detected it, what slowed us, actions with owners/dates. Publish a summary on the Transparency page for anything that affected citizens' data or funds. Update runbooks and alerts.
