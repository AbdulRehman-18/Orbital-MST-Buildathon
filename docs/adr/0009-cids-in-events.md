# ADR 0009 — IPFS CIDs in events, content hashes in storage

- **Status:** Accepted · **Date:** 2026-09-28 · Refines plan §7.3 (fix M-3)

## Context
Plan §7.6 set gas targets. First measurements (local, Shanghai, 59-char CIDv1) were well above:
each CID string costs ~3 fresh storage slots (~66k gas), and `createMilestone` also pushed to a
per-project id array. Plan goal G4 already makes Postgres a read model rebuilt from **events**.

## Decision
- Storage keeps what contracts need to enforce rules, plus the **content hash** that anchors
  integrity: `Project.metaHash`, `Milestone.metaHash`, `Milestone.proofHash`.
- **CIDs are emitted, not stored**: `ProjectCreated.metaCID`, `MilestoneCreated.metaCID`,
  `ProofSubmitted.proofCID`, `GrievanceFiled.cid`, `GrievanceResponded.responseCID`,
  `TenderPublished.metaCID`. Logs are on-chain and immutable, so a CID in an event is as
  tamper-evident as one in storage. Grievance CIDs are self-verifying (content-addressed), so no
  extra hash is stored for them.
- No `projectId → milestoneIds[]` array; the indexer derives it from `MilestoneCreated`.
- Role ids are compile-time constants in `NammaSevaBase` instead of external calls.
- "Verify on chain" (Phase 3/4): fetch content by CID from the event, `keccak256` it, compare with
  the stored hash.

## Result (median gas, `pnpm gas`)

| Call | Plan target | Before | After |
|---|---|---|---|
| createProject | < 180k | 248k | **179k** ✅ |
| createMilestone | < 120k | 279k | 158k |
| submitProof | < 110k | 198k | 122k |
| approveMilestone | < 70k | 114k | 105k |
| releaseFunds | < 90k | 110k | 102k |
| fileGrievance | < 100k | 219k | 143k |

Remaining gaps come from the security checks themselves (cross-contract status/ward/role reads)
and first-time storage writes. At MST's 1 gwei (ADR 0005) the most expensive call costs
≈ 0.00016 MSTC (158k gas), so a ward with 200 projects × 10 actions stays far below 1 MSTC/year. We accept
the gaps rather than weaken checks; revisit with a caching read path if fees rise.

## Consequences
- Contract getters return hashes, not CIDs; UIs read CIDs from the indexer.
- The indexer must not drop events — reorg-safe indexing (ADR 0004) is a hard requirement.
