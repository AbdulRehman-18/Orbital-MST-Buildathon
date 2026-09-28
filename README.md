# Namma Seva (Orbital MST Buildathon)

> **ನಮ್ಮ ಸೇವೆ · நம்ம சேவை · “Our Service”**  
> Blockchain-backed public infrastructure accountability on **MST Blockchain**.

## Overview

**Namma Seva** is a transparency and accountability platform for public works (roads, drains, water supply, lighting, parks, and civic facilities). It enables officials, auditors, contractors, and citizens to track project progress with verifiable records anchored on-chain.

This repository currently serves as the **implementation planning and delivery blueprint** for migrating and rebranding the existing DecentraliTrack MVP to MST.

## Why this project matters

Public project data is often fragmented, delayed, or hard to verify. Namma Seva aims to solve this by:

- Recording key project lifecycle actions as immutable blockchain transactions.
- Making project verification citizen-friendly and multilingual.
- Strengthening trust through auditable approvals, milestone proofs, and transparent fund-release workflows.

## Core goals

- Move the platform from Polygon Amoy to **MST testnet/mainnet**.
- Rebrand and localize as **Namma Seva** (Kannada, Tamil, Hindi, English).
- Harden smart contracts and remove centralized key custody risks.
- Build a production-grade backend/indexer where chain is source of truth.
- Add grievance, tender, anomaly-detection, and compliance capabilities.

## Target architecture (high level)

- **Clients:** Citizen PWA + role-based web dashboards
- **Backend:** Express + TypeScript API, SIWE/OTP auth, relayer, indexer, anomaly engine
- **Data:** PostgreSQL (Drizzle), Redis, IPFS/Pinata
- **Blockchain:** MST EVM contracts for access, registry, escrow, grievances, tenders

For full architecture and flow diagrams, see:
- `docs/NAMMA_SEVA_IMPLEMENTATION_PLAN.md`

## Delivery roadmap

The implementation is organized into 6 delivery phases over ~10 weeks:

1. Foundation & rebrand
2. Smart contracts v2 on MST testnet
3. Data layer, indexer, and API
4. Web app, wallets, and i18n
5. Citizen features, integrity checks, anomaly v2
6. Hardening, DevOps, audit, and pilot

Detailed phase breakdown:
- `docs/phases/README.md`
- `docs/phases/PHASE_1_FOUNDATION.md`
- `docs/phases/PHASE_2_CONTRACTS.md`
- `docs/phases/PHASE_3_BACKEND.md`
- `docs/phases/PHASE_4_WEB.md`
- `docs/phases/PHASE_5_FEATURES.md`
- `docs/phases/PHASE_6_HARDENING.md`

## Repository structure

```text
Orbital-MST-Buildathon/
├─ README.md
└─ docs/
   ├─ NAMMA_SEVA_IMPLEMENTATION_PLAN.md
   └─ phases/
      ├─ README.md
      ├─ PHASE_1_FOUNDATION.md
      ├─ PHASE_2_CONTRACTS.md
      ├─ PHASE_3_BACKEND.md
      ├─ PHASE_4_WEB.md
      ├─ PHASE_5_FEATURES.md
      └─ PHASE_6_HARDENING.md
```

## Getting started

Since this repository is currently documentation-first, the recommended starting point is:

1. Read `docs/NAMMA_SEVA_IMPLEMENTATION_PLAN.md` for end-to-end technical strategy.
2. Read `docs/phases/README.md` for scope decisions and sequencing.
3. Execute phase tasks in order and track milestones per phase DoD.

## Buildathon focus

For buildathon execution, the key near-term checkpoint is a **testnet demo** with a complete lifecycle visible on MST explorer:

- Project creation and approval
- Milestone creation and proof submission
- Multi-auditor approval
- Fund release event traceability

## Status

- ✅ Planning artifacts completed
- 🟨 Execution in phased implementation
- 🎯 Target: production-ready pilot after hardening and audit phase

## Contributing

Contributions should follow the phase plan and prioritize:

- Security-first contract and backend changes
- Deterministic indexing and observability
- Accessibility and multilingual UX
- Test coverage and verification evidence

## References

- MST developer docs: https://docs.mstblockchain.com/developer-docs
- Main implementation plan: `docs/NAMMA_SEVA_IMPLEMENTATION_PLAN.md`
