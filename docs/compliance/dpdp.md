# DPDP Act 2023 — how Namma Seva complies

> Engineering mapping, not legal advice. The Privacy Notice and Terms text in `packages/i18n` is a **draft prepared for the pilot** and must be reviewed by the ward's/ULB's counsel (and the Kannada/Tamil/Hindi text by native speakers) before public launch. Confirm current Rules/timelines (the Digital Personal Data Protection Rules were notified in phases) with counsel.

## Who is who
- **Data Fiduciary:** the operating body (ULB/department or the platform under the pilot MoU — decide and record in the MoU, [`pilot-mou-template.md`](pilot-mou-template.md)).
- **Data Principals:** citizens who sign in by phone; officials/auditors/contractors (wallet addresses — public role holders).
- **Grievance Officer:** named by the operator via `GRIEVANCE_OFFICER_NAME/EMAIL/PHONE`; published on `/transparency` and `/privacy`. Replies within 7 days (stated in the notice).

## Personal data inventory
| Data | Where | Why | Retention | Erasable |
|---|---|---|---|---|
| Phone number | **never stored** — used in memory to send the OTP | verify a real person | seconds | n/a |
| `sha256(phone + pepper)` ("citizen hash") | `users.phone_hash`, `otp_sessions` (≤ 24 h), `relayer_txs`, on-chain as the anonymous grievance id | de-duplicate and rate-limit citizens; link a citizen to their own grievances | account lifetime | account row: **yes**; on-chain use: **no** (public, immutable — carries no identity once `users`/`otp_sessions` are gone) |
| Consent record (notice version, language, time) | `consents` (no phone data) | evidence of consent | account lifetime | yes |
| Refresh sessions | `auth_sessions` (token *hash* only) | stay signed in | expiry (≤ 30 days) | yes |
| Preferred language | `users.preferred_lang` | UI | account lifetime | yes |
| Wallet address of role holders | chain + `users.wallet_address` | authorisation | while holding a role | not applicable (public office holders; on-chain) |
| Security/audit logs | `audit_log` (IP stored only as a peppered hash), container logs | security, CERT-In | **180 days**, then purged (`AUDIT_LOG_RETENTION_DAYS`, minimum 180) | retained by law |
| Grievance text and photos | IPFS (pinned) | public accountability | permanent | **no** — public by design; citizens are told before filing; PII detection/moderation is a pilot task |

**No PII on-chain** (exit criterion): the chain holds project data, payments, proof hashes, CIDs, and citizen *hashes*. Verified by construction (contract events/fields listed in `docs/NAMMA_SEVA_IMPLEMENTATION_PLAN.md` §8) and by a test that the data export contains no phone number (`apps/api/test/phase6.test.ts`).

## Requirements → implementation
| DPDP requirement | Implementation | Evidence |
|---|---|---|
| Notice + free, specific, informed consent, in a language the person understands (s.5–6) | Consent panel on the citizen login screen in en/kn/ta/hi with a required, unticked-by-default checkbox and a link to the full Privacy Notice; the API **refuses** to send an OTP or sign in without the current `consentVersion` | `apps/web/src/pages/login.tsx`, `apps/api/src/routes/auth.ts`, e2e `citizen phone login is gated on accepting the privacy notice` |
| Record of consent | one `consents` row per notice version per user (language, timestamp) | `apps/api/test/phase6.test.ts` |
| Notice changes → fresh consent | `CONSENT_VERSION` must equal the web bundle's `consent.version`; a mismatch is rejected with "reload and accept the current notice" | test `the server's notice version matches the one the web app shows` |
| Purpose limitation, data minimisation | phone never stored; only a peppered hash; only what login/rate-limits need | data inventory above |
| Right to access (s.11) | `GET /api/me/data` + "Download my data" on the citizen dashboard (JSON incl. consents and grievances filed under the anonymous code) | e2e `a citizen can download and then erase their data` |
| Right to erasure & withdrawal (s.12, s.6(4)) | `DELETE /api/me/data` deletes user, consents, sessions, OTP state, and unlinks operational records; session cookie cleared | `apps/api/test/phase6.test.ts` (*erases the account…*) |
| Right of grievance redressal (s.13) | Grievance Officer contact on `/privacy`, `/transparency`; 7-day reply commitment | `apps/web/src/pages/legal.tsx` |
| Retention limits (s.8(7)) | `runRetention` purges expired OTP/nonce/session rows daily and audit logs at 180 days | `apps/api/src/retention.ts`, tests |
| Security safeguards (s.8(5)) | TLS + HSTS, CSP, rate limits, KMS custody, peppered hashes, image re-encoding, least-privilege roles, monitoring | `docs/security/asvs-l2-checklist.md` |
| Breach notification (s.8(6)) | see below | [`incident-response.md`](../runbooks/incident-response.md) |
| Children (s.9) | Notice states the service is for adults; verifiable parental consent flow is **not** built — pilot is adults-only | decision recorded in ADR 0012 |

## The immutability tension (read this with counsel)
Erasure cannot remove what is already on a public blockchain. Design choices that make this defensible: (1) nothing on-chain identifies a person; (2) the citizen hash is derived with a **secret pepper**, so once the `users`/`otp_sessions` rows are erased nobody (including us) can link the hash to a phone number; (3) the notice tells the citizen this before they consent, and again in the erase dialog. Grievance *text* that the citizen chooses to write is public; the filing form warns not to include personal details.

## Breach notification
On a personal data breach: contain → assess (which data, which people) → notify the **Data Protection Board of India** and each affected person as the Act/Rules require (the Rules specify prompt notice plus a detailed report within a fixed window — confirm the current timelines with counsel and put them in the incident template) → also report to **CERT-In within 6 hours** ([`cert-in.md`](cert-in.md)). Given the data held (hashes, no phone numbers), the most likely affected data is the citizen-hash↔account mapping; rotate `JWT_SECRET`; **never rotate the pepper** (it would re-key every citizen).

## Operator checklist before launch
- [ ] Counsel has reviewed and approved the Privacy Notice and Terms in all four languages; `legal.updated` date set; bump `consent.version` and `CONSENT_VERSION` together if the text changes.
- [ ] Grievance Officer named and reachable (`GRIEVANCE_OFFICER_*` set); mailbox monitored; reply SLA agreed.
- [ ] Data Fiduciary identified in the MoU; processing agreements with the SMS provider (MSG91/Twilio), cloud host, Pinata, and backup storage — all with **data residency in India** where the contract requires it.
- [ ] Retention set (`AUDIT_LOG_RETENTION_DAYS=180`) and log/backup storage located in India.
- [ ] Erase/export tested end to end on staging with a real phone (e2e covers the demo path).
- [ ] Breach-response contacts (CERT-In, Board) in the on-call sheet.
