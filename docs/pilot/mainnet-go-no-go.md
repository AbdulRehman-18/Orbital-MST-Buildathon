# Mainnet go / no-go (plan §8.4)

Mainnet is gated. **Every box must be ticked and signed by the named owner.** A single unticked box is a *no-go*; do not negotiate individual items on the day.

| # | Gate | Owner | Evidence | Status |
|---|---|---|---|---|
| 1 | **External audit complete; 0 open Critical/High**; report published (`AUDIT_REPORT_URL`) | Security lead | audit report, fix PRs, re-review letter | ○ open — auditor not yet engaged |
| 2 | Deployed commit = audited commit | Tech lead | `git rev-parse` in the deploy runbook §1 vs report | ○ |
| 3 | Deployer is a **hardware wallet**; deploy script guards pass (≥ 5 owners, 3-of-5, ≥ 48 h, real treasury) | Deployer + Witness | runbook §2–3, screen recording | ○ |
| 4 | **Multisig + timelock live**; ADMIN and PAUSER handed over; deployer renounced | Deployer + owners | `/api/transparency` → `MULTISIG_TIMELOCK`, 5 owners, 48 h; `multisig list` | ○ |
| 5 | All contracts **verified on mstscan.com**; addresses published in the repo (`docs/deployments/mstMainnet.md`) and on the Transparency page | Tech lead | explorer links | ○ |
| 6 | Relayer keys in **KMS**; funded; **daily spend cap** set; alerts firing | Ops | `kms:address`, `RELAYER_DAILY_CAP`, alert test | ○ |
| 7 | Runbooks **rehearsed on testnet by the real owners**: upgrade, pause/resume, role rotation, relayer key rotation, restore, incident/CERT-In | Incident commander | [`rehearsal-log.md`](rehearsal-log.md) | ○ (automated governance rehearsal ✔; human rehearsal ○) |
| 8 | Monitoring & alerts live; on-call sheet filled | Ops | Grafana, alert drill | ○ |
| 9 | Nightly backups + a **passed** restore drill this month | Ops | `restore-drill` run | ○ |
| 10 | Load test (500 readers + 20 tx/min) passed | Tech lead | [`load-test-results.md`](load-test-results.md) | ○ |
| 11 | 1-week staging soak on MST testnet, no SEV1/2 | Tech lead | [`soak-test.md`](soak-test.md) | ○ |
| 12 | Accessibility: axe clean ✔ **and** manual screen-reader pass in all 4 languages | Product | [`accessibility.md`](accessibility.md) | ◐ axe ✔, manual ○ |
| 13 | Compliance: counsel-approved Privacy Notice/Terms; Grievance Officer live; DPDP checklist; CERT-In contacts; log storage in India | Legal | [`dpdp.md`](../compliance/dpdp.md), [`cert-in.md`](../compliance/cert-in.md) | ◐ draft text ✔, approvals ○ |
| 14 | Independent web/API **penetration test**, criticals closed | Security lead | report | ○ |
| 15 | Pilot review: metrics met and the Authority agrees to proceed | Authority | [`success-metrics.md`](success-metrics.md) | ○ |
| 16 | **MST confirms** mainnet deployer/contract deployment is permitted (plan §21 Q6) and pilot gas allocation (Q9) | Tech lead | written reply from MST support | ○ |
| 17 | `NS_DEMO_MODE` unset, `NS_CHAIN=mstMainnet`, prod env reviewed by a second person | Ops | config review checklist | ○ |

## Decision
Date: ‹…› · Decision: ☐ GO ☐ NO-GO · Signatories: Authority ‹…› · Security lead ‹…› · Tech lead ‹…› · Incident commander ‹…› · Legal ‹…›

## Current position (updated 2026-09-29)
Engineering deliverables are complete and evidenced (CI/CD, hardening, KMS, emergency stop, consent/erasure, retention, observability, Transparency page, runbooks, automated a11y). **The remaining gates are organisational or need real-world inputs** — audit engagement, hardware-wallet ceremony, owners, counsel, the MoU, pen test, MST confirmation — and cannot be closed from the repository. Until they are, the correct state is **NO-GO for mainnet** and testnet pilot only.
