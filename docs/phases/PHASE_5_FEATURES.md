# Phase 5 — Citizen, Integrity & Anomaly Features

**Duration:** Weeks 6–7 · **Depends on:** Phases 3 & 4 · **Plan refs:** §13, §14, §15

## Goal
Add the features that make Namma Seva more than a ledger: citizen grievances, on-chain tenders, tamper-evident proof media, and anomaly detection v2 — plus open-data export.

## 1. Citizen grievances (§15)
**Backend**
- [ ] `POST /api/grievances`, `POST /api/grievances/:id/upvote`, `GET /api/grievances?projectId=` (OpenAPI first).
- [ ] Text/photo → moderation queue (hate speech / PII) → IPFS pin → relayer `fileGrievance(projectId, cid, category, citizenHash)`.
- [ ] One upvote per verified phone per grievance; 3 grievances/day/phone; hCaptcha.
- [ ] Threshold (e.g. 25 unique upvotes) → `GrievanceThresholdReached` → auditor SLA 7 days; SLA breach → anomaly.

**Web (shadcn)**
- [ ] `/citizen`: grievance `Form` in a `Sheet` — category `RadioGroup`, `Textarea`, photo capture, GPS; "My grievances" `DataTable`.
- [ ] Project page Grievances tab: list `Card`s with upvote `Button`, status timeline, auditor response.
- [ ] Auditor: respond `Dialog` with action `Select` (incl. `PAUSE_PROJECT`) → wallet `TxButton`.

## 2. Tenders (on-chain)
- [ ] Replace off-chain `routes/tenders.ts` with `TenderRegistry` reads (indexer) + wallet writes.
- [ ] Commit/reveal bid flow: commit `keccak256(amount, salt)`, salt stored client-side with download backup, reveal window, award → `assignContractor`.
- [ ] `/tenders`: board `DataTable`, tender detail `Tabs` (Details / Bids / Result), countdown `Badge`s for commit/reveal deadlines.

## 3. Proof integrity (§13)
Harden `ipfsService.ts` and the `/milestones/:id/proof/upload` route:
- [ ] Camera-only capture in strict mode; server re-extracts EXIF with `exifr`.
- [ ] Checks: geofence (default 250 m, per-category), EXIF time ±48 h and after milestone creation, pHash duplicate across all milestones.
- [ ] Strip device-identifying EXIF, keep GPS + time; re-encode image; generate thumbnail.
- [ ] Pin images + canonical `proof.json` to Pinata **and** a backup pin service; return `proofCID` + `contentHash`.
- [ ] Failed checks don't block submission — they create anomalies.
- [ ] Auditor proof view: check results as `Badge`s, proof-vs-project GPS on `ProjectMap`, side-by-side images.

## 4. Anomaly detection v2 (§14)
Port `anomalyEngine.ts` from in-memory → Postgres + chain events:
- [ ] Rules: budget overrun, stalled approval (>14 d), stalled milestone (>7 d), spending velocity, GPS mismatch, duplicate media, auditor–contractor collusion, contractor concentration, grievance spike, split tendering, off-hours approvals.
- [ ] Write to `anomalies`; each rule unit-tested with fixtures.
- [ ] Auditor anomaly panel: `DataTable` with severity `Badge`s, resolve `Dialog`.
- [ ] Public project page shows neutral "Under review" `Alert` — never accusations.
- [ ] Optional: daily Merkle root of anomalies anchored on-chain (`AnomalyAnchor`).

## 5. Open data
- [ ] `GET /api/public/export.csv` + JSON per ward; download buttons on `/ward/:wardId`.
- [ ] Mention RTI Sec. 4 suo-motu disclosure alignment on the "How it works" page.

## Deliverables
- Grievance, tender, proof-integrity and anomaly features, end-to-end on MST testnet.

## Exit criteria
- [ ] Every anomaly rule and proof check covered by tests.
- [ ] Citizen grievance flow (OTP → file → upvote → auditor response) works on a low-end Android phone over throttled 3G.
- [ ] Tender commit → reveal → award assigns the contractor on-chain.
