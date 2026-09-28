# Phase 6 — Hardening, DevOps & Pilot

**Duration:** Weeks 8–10 · **Depends on:** Phase 5 · **Plan refs:** §8.4, §16, §17, §18, §20

## Goal
Make the system safe to run with real public data: security review, compliance, CI/CD, monitoring, a one-ward pilot on MST testnet, then a gated mainnet launch.

## 1. Security
- [ ] Slither + Aderyn in CI (fail on High); OWASP ZAP baseline against staging.
- [ ] External smart-contract audit (2–3 weeks, start at beginning of phase); fix all Critical/High.
- [ ] OWASP ASVS L2 checklist for API; `pnpm audit`, Dependabot, Socket.dev.
- [ ] Nginx CSP headers; upload size/type limits; image re-encode confirmed.
- [ ] Emergency `pause()` + role rotation rehearsed on testnet.

## 2. Keys (§16.2)
- [ ] Deployer = hardware wallet, unused after deploy.
- [ ] ADMIN → 3-of-5 multisig (Safe if available on MST, else `NammaSevaMultisig`) + 48 h timelock; deployer renounces.
- [ ] Relayer via KMS / Vault transit signer, daily spend cap, quarterly rotation.

## 3. Compliance (India)
- [ ] DPDP Act 2023: consent notice at OTP login in the user's language, purpose limitation, access/erase for off-chain data, grievance-officer contact. Confirm **no PII on-chain**.
- [ ] Privacy policy + terms in kn/ta/hi/en (shadcn `Dialog` at first login + static pages).
- [ ] CERT-In: 6-hour incident reporting procedure, 180-day log retention.
- [ ] GIGW 3.0 check for government-hosted deployment.
- [ ] Written MoU / pilot approval from the ward / ULB.

## 4. CI/CD (§18.2)
- [ ] `ci.yml`: install → lint → typecheck → contracts test + coverage → Slither → API tests (Testcontainers) → web build → Playwright (Hardhat).
- [ ] `deploy-dev.yml`: on `main` → build images → push GHCR → deploy.
- [ ] `deploy-contracts.yml`: manual dispatch, network input → deploy → verify → PR with `deployments/*.json`.
- [ ] Environments: `local` (Hardhat) · `dev` + `staging` (MST testnet, separate deployments) · `prod` (MST mainnet).

## 5. Runtime & observability
- [ ] Images `namma-seva-api`, `namma-seva-indexer` (same image, different command), `namma-seva-web` (Nginx static); compose/prod adds Redis.
- [ ] Prometheus metrics: `indexer_lag_blocks`, `relayer_balance`, `tx_failures_total`, `rpc_latency_ms`; Grafana dashboards; Slack/email alerts.
- [ ] Nightly Postgres backup + weekly restore test (plus chain rebuild as last resort).
- [ ] Runbooks in `docs/runbooks/`: upgrade, pause, role rotation, relayer key rotation, incident response.

## 6. Quality gates
- [ ] k6 load: 500 concurrent citizen readers, 20 tx/min writes.
- [ ] Accessibility: axe clean + manual screen-reader pass in all 4 languages.
- [ ] 1-week staging soak on MST testnet.

## 7. Pilot & mainnet
- [ ] Pilot one ward (ledger mode): 1 official, 2–3 auditors, 2 contractors, 3–5 real projects.
- [ ] Public **Transparency** page (shadcn) listing verified contract addresses + PoSA trust-assumption disclosure.
- [ ] Mainnet go/no-go (§8.4): audit closed, multisig + timelock live, relayer funded with cap, runbooks rehearsed.
- [ ] Deploy + verify on mstscan.com; publish addresses in repo and on the site.

## Deliverables
- Audited contracts, CI/CD, monitoring, runbooks, live ward pilot, mainnet deployment.

## Exit criteria
- [ ] 0 open Critical/High findings.
- [ ] Pilot live; contracts verified on mstscan.com; Transparency page published.
- [ ] All §2.3 success metrics measured and met.
