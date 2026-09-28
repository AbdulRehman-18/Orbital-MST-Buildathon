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

export type SiweCheck = { domain: string; chainId: number; provider?: Provider };

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
  if (msg.domain !== check.domain) throw new SiweError(`Domain must be ${check.domain}`);
  if (msg.chainId !== check.chainId) throw new SiweError(`Chain id must be ${check.chainId}`);

  // Burn the nonce first so a signature can never be replayed, even concurrently.
  const burned = await db
    .update(authNonces)
    .set({ usedAt: new Date() })
    .where(and(eq(authNonces.nonce, msg.nonce), isNull(authNonces.usedAt), gt(authNonces.expiresAt, new Date())))
    .returning({ nonce: authNonces.nonce });
  if (burned.length === 0) throw new SiweError("Unknown, used or expired nonce");

  const result = await msg
    .verify({ signature, domain: check.domain, nonce: msg.nonce, time: new Date().toISOString() }, {
      provider: check.provider as never,
      suppressExceptions: true,
    })
    .catch(() => null);
  if (!result?.success) throw new SiweError(result?.error?.type ?? "Invalid signature");
  return msg.address.toLowerCase();
}
