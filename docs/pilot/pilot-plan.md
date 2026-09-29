# One-ward pilot plan

**Goal:** prove the loop end to end with real people and real (small) projects before any mainnet launch: an official records a project, auditors approve proof, a contractor is paid (ledger mode), citizens verify and raise grievances — with every step on MST and inspectable.

## Preconditions (Phase 6 §3, §7)
- [ ] Signed pilot approval / MoU ([`../compliance/pilot-mou-template.md`](../compliance/pilot-mou-template.md)).
- [ ] Privacy Notice and Terms approved by counsel in en/kn/ta/hi; Grievance Officer named.
- [ ] Staging soak (1 week) green — [`soak-test.md`](soak-test.md); load test passed — [`load-test-results.md`](load-test-results.md).
- [ ] Runbooks rehearsed by the real people — [`rehearsal-log.md`](rehearsal-log.md).
- [ ] On-call sheet filled and printed (below).

## Cast (pilot ward: ‹ward no. / name›)
| Role | Who | Count | Wallet | Notes |
|---|---|---|---|---|
| Government official | ‹Ward engineer› | 1 | own wallet (BridgeKey/MetaMask) | creates projects, releases funds |
| Auditors | ‹Independent quality auditor, social-audit unit, civic-society nominee› | 2–3 | own wallets | approve projects and milestone proofs |
| Contractors | ‹firms› | 2 | own wallets | submit proof photos |
| Citizens | ‹RWA volunteers, ward committee› | 20–50 | phone OTP (no wallet) | verify, raise/upvote grievances |
| Multisig owners | dept head · IT officer · independent auditor · civic-society rep · platform | 5 | hardware wallets | 3-of-5; see role-rotation |

Hand out wallets with a 30-minute onboarding (create wallet → add MST network → sign in); no private key ever passes through the team.

## Data
3–5 **real** projects chosen with the Authority: title, ward, budget, sanction reference, milestones and contractor. Budget and payment references only as the Authority is willing to publish (RTI s.4). Confirm each project's public-disclosure approval in writing. Ledger mode: the chain records approvals and payment reference hashes; money continues to move through PFMS.

## Timeline
| Week | Activity | Exit check |
|---|---|---|
| −2 | MoU signed; wallets issued; counsel sign-off; staging soak begins | soak running, alerts firing to the right people |
| −1 | Rehearsals (pause, role rotation, relayer, restore); training sessions for officials/auditors/contractors (kn + en); citizen briefing | rehearsal log complete |
| 0 | Go-live on ‹testnet ledger-mode pilot / mainnet if the go/no-go is signed›; first project created on-chain | project visible on `/projects`, `/verify`, Transparency |
| 1–4 | Live operation: weekly review with the Authority; measure the success metrics; log every defect | weekly report |
| 5 | Pilot review: metrics, citizen feedback, incident review, decision on mainnet / extension | go/no-go recorded |

## On-call sheet (fill, print, keep offline)
| Function | Name | Phone | Backup |
|---|---|---|---|
| Incident commander | | | |
| Technical lead | | | |
| Comms / Authority liaison | | | |
| Grievance Officer | | | |
| CERT-In point of contact | | | |
| Multisig owners reachable in < 15 min (need 3) | | | |
| Hosting / cloud console owner | | | |
| SMS provider support | | | |

## Success criteria for the pilot
See [`success-metrics.md`](success-metrics.md) plus: every project's milestones reconcile with the Authority's own records; zero unexplained anomalies left unresolved after 7 days; ≥ 80 % of citizens surveyed can find a project and understand its proof; the Authority agrees to continue.

## Risks specific to the pilot
| Risk | Mitigation |
|---|---|
| Officials reluctant to have data public | written approval per project; start with completed or low-sensitivity works |
| Wallet friction for auditors/contractors | in-person onboarding; a spare pre-funded hardware wallet at the ward office |
| MST validator incident | Transparency page discloses the trust model; pause procedure; IPFS + open-data copies |
| SMS delivery failures | MSG91 primary, Twilio fallback provider ready; support contact in on-call sheet |
| Low citizen participation | ward WhatsApp share links from every project page; QR posters at sites |
