// Data retention (plan §17): CERT-In directions require security logs to be kept for 180 days; the
// Privacy Notice promises nothing is kept longer than needed. This job enforces both — audit rows
// older than the retention window go, and short-lived credentials (expired OTPs, nonces, sessions)
// are purged so a database leak holds as little as possible.
import { authNonces, authSessions, auditLog, lt, or, otpSessions, type Db, isNotNull, and } from "@namma-seva/db";
import type { Logger } from "pino";

export const MIN_LOG_RETENTION_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RetentionResult = { auditLog: number; otpSessions: number; nonces: number; sessions: number };

export async function runRetention(db: Db, opts: { auditLogDays: number; now?: Date }): Promise<RetentionResult> {
  const now = opts.now ?? new Date();
  const auditCutoff = new Date(now.getTime() - opts.auditLogDays * DAY_MS);
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS);

  const [audit, otp, nonces, sessions] = await Promise.all([
    db.delete(auditLog).where(lt(auditLog.at, auditCutoff)).returning({ id: auditLog.id }),
    // A code is useless five minutes after it was sent; keep a day so "too many codes" limits still hold.
    db.delete(otpSessions).where(lt(otpSessions.windowStart, dayAgo)).returning({ p: otpSessions.phoneHash }),
    db.delete(authNonces).where(lt(authNonces.expiresAt, dayAgo)).returning({ n: authNonces.nonce }),
    // Refresh sessions: expired, or revoked more than 30 days ago (kept that long for incident forensics).
    db
      .delete(authSessions)
      .where(or(lt(authSessions.expiresAt, now), and(isNotNull(authSessions.revokedAt), lt(authSessions.revokedAt, monthAgo))))
      .returning({ id: authSessions.id }),
  ]);
  return { auditLog: audit.length, otpSessions: otp.length, nonces: nonces.length, sessions: sessions.length };
}

/** Runs once at start-up, then every 6 hours. Returns a stop function. */
export function startRetentionJob(db: Db, logger: Logger, auditLogDays: number, intervalMs = 6 * 60 * 60 * 1000) {
  const tick = () =>
    runRetention(db, { auditLogDays })
      .then((r) => {
        if (r.auditLog + r.otpSessions + r.nonces + r.sessions > 0) logger.info(r, "Retention: purged expired records");
      })
      .catch((err) => logger.warn({ err: (err as Error).message }, "Retention job failed"));
  void tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
