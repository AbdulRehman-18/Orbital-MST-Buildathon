# OWASP ASVS 4.0.3 Level 2 — API and web self-assessment

Scope: `apps/api`, `apps/web`, `infra/`. Smart contracts have their own review track ([`phase-2-static-analysis.md`](phase-2-static-analysis.md), [`audit-scope.md`](audit-scope.md)). **Status:** ✔ implemented and evidenced · ◐ partial · ○ open (owner in the last column) · n/a. This is a preparation aid for the independent web/API penetration test — it is not a certification.

## V1 Architecture, design and threat modelling
| Req | Status | Evidence |
|---|---|---|
| 1.1 Secure SDLC, threat model | ◐ | Trust boundaries and relayer power documented in `phase-2-static-analysis.md` and ADR 0006/0010/0012; formal STRIDE workshop before mainnet ○ (Security lead) |
| 1.2 Authentication architecture | ✔ | SIWE for role holders (roles read from chain, not the DB); phone OTP for citizens; ADR 0010 |
| 1.4 Access-control architecture | ✔ | Authorisation is on-chain: the API's role gate is UX only, every privileged action is signed by the user's own wallet and checked by contracts |
| 1.5 Input/output architecture | ✔ | zod schemas generated from the OpenAPI spec validate every body/query/param |
| 1.6 Cryptographic architecture | ✔ | KMS custody for the relayer key, HMAC-derived citizen keys, peppered hashes; `docs/runbooks/relayer-key-rotation.md` |
| 1.7 Errors/logging architecture | ✔ | pino with redaction, request ids, `audit_log`, metrics |
| 1.8 Data protection architecture | ✔ | `docs/compliance/dpdp.md` data inventory; no PII on-chain |
| 1.10 Build/deploy | ✔ | CI gates, pinned lockfile, `minimumReleaseAge` supply-chain guard, images built in CI |
| 1.14 Configuration architecture | ✔ | production refuses to boot without secrets; demo mode refused in production and on mainnet |

## V2 Authentication
| 2.1 Passwords | n/a | no passwords; wallets + OTP |
| 2.2 General authenticator | ✔ | SIWE binds domain + chain id + single-use nonce (5 min, burned before signature check) — `apps/api/src/auth/siwe.ts`, tests in `test/auth.test.ts` |
| 2.3 Authenticator lifecycle | n/a | |
| 2.5 Credential recovery | n/a | wallets are the user's; citizens re-verify by OTP |
| 2.6 Look-up secret / 2.7 OOB (OTP) | ✔ | 6-digit code, 5-minute expiry, 5 attempts, ≤ 5 sends/hour/phone, constant-time comparison, only hash stored — `src/auth/otp.ts` |
| 2.8 Time-based OTP | n/a | |
| 2.9 Cryptographic verifier | ✔ | EIP-191/EIP-1271 signature verification via `siwe` |
| 2.10 Service authentication | ✔ | relayer/IPFS/OTP provider secrets in env/KMS, never in code; `/metrics` bearer token |

## V3 Session management
| 3.2 Session binding | ✔ | 15-min JWT (HS256, pinned algorithm, issuer check) in memory only; refresh token in `HttpOnly; Secure; SameSite=Lax; Path=/api/auth` cookie |
| 3.3 Termination | ✔ | logout revokes; refresh tokens rotate on every use; old token is rejected; sessions purged by the retention job |
| 3.4 Cookie-based | ✔ | flags above; CSRF-safe because state changes need the bearer token, not the cookie |
| 3.7 Defences against abuse | ◐ | per-IP rate limits; refresh-token *family* revocation on reuse ○ (API team) |

## V4 Access control
| 4.1 General | ✔ | deny by default: `requireAuth(role…)`; ward scoping mirrored from chain events |
| 4.2 Operation-level | ✔ | citizens can only read their own data (`/me/data`, `?mine=true`); anomaly details only for reviewers (`canSeeAnomalyDetails`) |
| 4.3 Other | ✔ | admin actions are timelocked on-chain |

## V5 Validation, sanitisation, encoding
| 5.1 Input validation | ✔ | zod on every route, length/size limits (`express.json` 256 kB) |
| 5.2 Sanitisation / sandboxing | ✔ | IPFS content is served with `default-src 'none'; sandbox`; CSV export neutralises formula injection (`csvCell`) |
| 5.3 Output encoding / injection | ✔ | React escapes; drizzle parameterises all SQL; no dynamic SQL from user input |
| 5.5 Deserialisation | ✔ | JSON only; no native deserialisation |

## V6 Stored cryptography
| 6.1 Data classification | ✔ | inventory in dpdp.md |
| 6.2 Algorithms | ✔ | SHA-256, HMAC-SHA256, secp256k1/ECDSA (Ethereum), HS256 JWT; no custom crypto |
| 6.4 Secret management | ✔ | KMS for keys; `JWT_SECRET` ≥ 32 chars enforced; startup guards |

## V7 Error handling and logging
| 7.1 Log content | ✔ | no secrets/PII; `authorization`, `cookie` redacted; IPs hashed |
| 7.2 Log processing | ✔ | structured JSON; 180-day retention (CERT-In) |
| 7.4 Error handling | ✔ | generic 500 (no stack traces); typed HttpError for client errors |

## V8 Data protection
| 8.1 General | ✔ | DPDP mapping; no PII on-chain; export/erase endpoints |
| 8.2 Client-side | ✔ | access token never in storage; only UI prefs (theme, language) in localStorage; CSP forbids inline script |
| 8.3 Sensitive private data | ✔ | phone number never stored; minimal retention |

## V9 Communications
| 9.1 Client comms | ✔ | HSTS, `upgrade-insecure-requests`; TLS terminates at the load balancer (min TLS 1.2 — configure there ○ Ops) |
| 9.2 Server comms | ✔ | outbound calls (Pinata, MSG91, KMS, RPC) over HTTPS |

## V10 Malicious code
| 10.2 Integrity | ✔ | lockfile with integrity hashes; dependency-review + `pnpm audit` in CI; Dependabot; no `eval`/dynamic import of user data |
| 10.3 Deployed application integrity | ◐ | image digests pinned by tag from CI; image signing (cosign) ○ (Ops) |

## V11 Business logic
| 11.1 | ✔ | on-chain state machine enforces order (approvals threshold, milestone states); relayer per-citizen daily limit and spend cap; anomaly rules flag abuse patterns |

## V12 Files and resources
| 12.1 Upload | ✔ | 10 MB × 5 files, MIME allow-list, images **re-encoded** with sharp (drops EXIF/metadata, neutralises polyglots), perceptual hash for duplicate detection; Nginx `client_max_body_size` 55 m only on the upload route |
| 12.3 Path/execution | ✔ | uploads never touch the filesystem in production (memory → IPFS) |
| 12.5 Serving | ✔ | pinned content served sandboxed with restrictive CSP |
| 12.6 SSRF | ✔ | server fetches only configured hosts (Pinata, gateway, OTP provider, RPC) |

## V13 API and web service
| 13.1 Generic | ✔ | one OpenAPI contract → generated zod + client; rate limits (Redis-backed in production) |
| 13.2 RESTful | ✔ | strict content-types, CORS allow-list with credentials |
| 13.4 GraphQL | n/a | |

## V14 Configuration
| 14.1 Build | ✔ | reproducible CI builds; `pnpm --frozen-lockfile` |
| 14.2 Dependency | ✔ | audit + Dependabot; OpenZeppelin pinned exactly (5.4.0, opcode reasons) |
| 14.3 Unintended disclosure | ✔ | `x-powered-by` off, `server_tokens off`, `/metrics` not routable via the public tier, debug/demo off in production |
| 14.4 HTTP headers | ✔ | CSP (no inline scripts), HSTS, XFO/frame-ancestors, nosniff, Referrer-Policy, COOP, Permissions-Policy — `infra/docker/nginx.conf.template` |
| 14.5 Validate HTTP request headers | ✔ | `x-request-id` accepted only if `^[\w-]{1,64}$` |

## Open items before the pilot goes public
1. Independent web/API penetration test (Nginx + API on staging) — ○ Security lead. ZAP baseline runs in CI but is not a substitute.
2. Refresh-token family revocation on reuse — ○ API.
3. Image signing / SBOM publication — ○ Ops.
4. TLS ≥ 1.2, modern ciphers, HSTS preload decision at the terminator — ○ Ops.
5. STRIDE workshop and written threat model — ○ Security lead.
