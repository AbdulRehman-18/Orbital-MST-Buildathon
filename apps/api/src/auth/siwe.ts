// Sign-In With Ethereum (EIP-4361) for officials, auditors and contractors (plan §10).
import { and, authNonces, eq, gt, isNull, lt, type Db } from "@namma-seva/db";
import type { Provider } from "ethers";
import { generateNonce, SiweMessage } from "siwe";

export const NONCE_TTL_MS = 5 * 60 * 1000;

export async function issueNonce(db: Db): Promise<{ nonce: string; expiresAt: Date }> {
  const nonce = generateNonce();
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
  await db.insert(authNonces).values({ nonce, expiresAt });
  // Opportunistic cleanup keeps the table small without a cron.
  await db.delete(authNonces).where(lt(authNonces.expiresAt, new Date(Date.now() - NONCE_TTL_MS)));
  return { nonce, expiresAt };
}

/** `domains`: allowed SIWE domains (host[:port]); "*.example.com" matches any subdomain (dev only). */
export type SiweCheck = { domains: string[]; chainId: number; provider?: Provider };

export function siweDomainAllowed(domain: string, allowed: string[]): boolean {
  const d = domain.toLowerCase();
  return allowed.some((p) => {
    const pat = p.toLowerCase();
    return pat.startsWith("*.") ? d.endsWith(pat.slice(1)) && d.length > pat.length - 1 : d === pat;
  });
}

/**
 * Domain the wallet should sign for: the host the user actually opened (forwarded by the web
 * server / tunnel) when it is on the allowlist, else the first configured domain.
 */
export function pickSiweDomain(host: string | undefined, allowed: string[]): string {
  const h = host?.split(",")[0].trim().toLowerCase();
  if (h && siweDomainAllowed(h, allowed)) return h;
  return allowed.find((p) => !p.startsWith("*.")) ?? allowed[0];
}

export class SiweError extends Error {}

/**
 * Verifies domain, chain id, expiry and signature (EOA, or EIP-1271 when a provider is given), and
 * burns the nonce. Returns the lower-cased signer address.
 */
export async function verifySiwe(db: Db, message: string, signature: string, check: SiweCheck): Promise<string> {
  let msg: SiweMessage;
  try {
    msg = new SiweMessage(message);
  } catch {
    throw new SiweError("Malformed SIWE message");
  }
  if (!siweDomainAllowed(msg.domain, check.domains)) throw new SiweError(`Domain ${msg.domain} is not allowed`);
  if (msg.chainId !== check.chainId) throw new SiweError(`Chain id must be ${check.chainId}`);

  // Burn the nonce first so a signature can never be replayed, even concurrently.
  const burned = await db
    .update(authNonces)
    .set({ usedAt: new Date() })
    .where(and(eq(authNonces.nonce, msg.nonce), isNull(authNonces.usedAt), gt(authNonces.expiresAt, new Date())))
    .returning({ nonce: authNonces.nonce });
  if (burned.length === 0) throw new SiweError("Unknown, used or expired nonce");

  const result = await msg
    .verify({ signature, domain: msg.domain, nonce: msg.nonce, time: new Date().toISOString() }, {
      provider: check.provider as never,
      suppressExceptions: true,
    })
    .catch(() => null);
  if (!result?.success) throw new SiweError(result?.error?.type ?? "Invalid signature");
  return msg.address.toLowerCase();
}
