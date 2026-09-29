# CERT-In Directions (28 April 2022) — how Namma Seva meets them

| Direction | Requirement | How it is met | Owner |
|---|---|---|---|
| **6-hour reporting** | Report specified cyber incidents to CERT-In within 6 hours of noticing | Incident procedure in [`incident-response.md`](../runbooks/incident-response.md#cert-in-reporting-6-hours); on-call sheet holds the reporting contacts; template below | Incident commander |
| **180-day logs** | Maintain logs of ICT systems for a rolling 180 days, **within Indian jurisdiction** | `audit_log` kept 180 days by the retention job (`AUDIT_LOG_RETENTION_DAYS`, ≥ 180 enforced at start-up); container/Nginx/API logs shipped to storage in India with a ≥ 180-day lifecycle (ap-south-1); backups in India | Platform operator |
| **NTP sync** | Sync system clocks to NIC/NPL NTP | Hosts use `time.nplindia.org` / `samay1.nic.in` (set in the host image); containers inherit host time. Chain timestamps are validator-provided and not relied on for security decisions | Platform operator |
| **Point of contact** | Designate a POC for CERT-In | Named in the on-call sheet | Operator |
| **Log content** | Include request time, source, action | pino request logs carry request id, method, path (no query strings, no auth headers or cookies — redacted), status; audit rows carry actor, action, peppered IP hash, time | API |

## What to log (already implemented)
- API: `req.id`, method, path, status, duration; `authorization`, `cookie`, `set-cookie` redacted.
- `audit_log`: sign-ins (SIWE/OTP), role-affecting actions, anomaly resolutions, privacy erasures.
- On-chain: every state change is a public event — the strongest audit trail.
- Not logged: phone numbers, OTP codes (except `OTP_PROVIDER=console` in development), private keys, request bodies.

## Log shipping (production)
Set the compose logging driver to your log service and a lifecycle of **≥ 180 days** (e.g. CloudWatch Logs retention 180 days → S3 Glacier in `ap-south-1`). Do not delete logs earlier, even on a DPDP erasure request (legal-obligation retention; the logs hold no phone numbers).

## Report template
```
To: incident@cert-in.org.in
Subject: Cyber incident report — Namma Seva (<operator>) — <short title> — <UTC time>

1. Reporter: name, role, phone, email, organisation
2. Time noticed (IST/UTC) and time of occurrence (if known)
3. Type: (targeted scanning / compromise of systems / unauthorised access / data breach / data leak / attack on application / DoS / malicious code / …)
4. Systems affected: URL(s), IP(s), OS/services, cloud region
5. Description: what happened, what evidence
6. Impact: data affected (kinds, approximate number of people), service impact, funds at risk (Y/N)
7. Actions taken so far: containment, pause of contracts (Y/N)
8. Indicators: IPs, hashes, addresses, transaction hashes
9. Contact for follow-up during the incident
```
Attach: timeline, relevant log excerpts, transaction links on https://mstscan.com.
