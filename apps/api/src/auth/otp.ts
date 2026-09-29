// Citizen phone OTP (plan §10). Only sha256(phone + pepper) is stored; the raw number exists only
// long enough to hand it to the SMS provider.
import { randomInt, timingSafeEqual } from "node:crypto";
import { eq, otpSessions, type Db } from "@namma-seva/db";
import type { Logger } from "pino";
import { sha256Hex } from "../lib/hash";

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_SENDS_PER_HOUR = 5;

export interface OtpSender {
  send(e164: string, code: string): Promise<void>;
}

export type OtpProviderConfig = {
  provider: "msg91" | "twilio" | "console";
  apiKey?: string;
  templateId?: string;
  sender?: string;
  twilioAccountSid?: string;
};

/** MSG91 OTP API v5 with our own code (`otp` param) so verification stays in this service. */
class Msg91Sender implements OtpSender {
  constructor(
    private readonly authKey: string,
    private readonly templateId: string,
  ) {}

  async send(e164: string, code: string) {
    const url = new URL("https://control.msg91.com/api/v5/otp");
    url.searchParams.set("template_id", this.templateId);
    url.searchParams.set("mobile", e164.replace(/^\+/, ""));
    url.searchParams.set("otp", code);
    url.searchParams.set("otp_expiry", String(OTP_TTL_SECONDS / 60));
    const res = await fetch(url, {
      method: "POST",
      headers: { authkey: this.authKey, "content-type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`MSG91 send failed (${res.status})`);
  }
}

class TwilioSender implements OtpSender {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
  ) {}

  async send(e164: string, code: string) {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64"),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: e164, From: this.from, Body: `Namma Seva code: ${code}. Valid 5 minutes.` }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Twilio send failed (${res.status})`);
  }
}

/** Development only: logs the code (never the number) instead of sending an SMS. */
class ConsoleSender implements OtpSender {
  constructor(private readonly logger: Logger) {}

  async send(e164: string, code: string) {
    this.logger.warn({ phoneSuffix: e164.slice(-4), code }, "DEV OTP (OTP_PROVIDER=console)");
  }
}

export function createOtpSender(cfg: OtpProviderConfig, logger: Logger): OtpSender {
  switch (cfg.provider) {
    case "msg91":
      if (!cfg.apiKey || !cfg.templateId) throw new Error("OTP_PROVIDER=msg91 needs OTP_API_KEY and OTP_TEMPLATE_ID");
      return new Msg91Sender(cfg.apiKey, cfg.templateId);
    case "twilio":
      if (!cfg.apiKey || !cfg.twilioAccountSid || !cfg.sender) {
        throw new Error("OTP_PROVIDER=twilio needs OTP_API_KEY (auth token), TWILIO_ACCOUNT_SID and OTP_SENDER");
      }
      return new TwilioSender(cfg.twilioAccountSid, cfg.apiKey, cfg.sender);
    case "console":
      return new ConsoleSender(logger);
  }
}

const codeHash = (phoneHash: string, code: string) => sha256Hex(`${phoneHash}:${code}`);

/** `code` is returned so demo mode can show it on screen; never expose it otherwise. */
export type SendResult = { ok: true; code: string } | { ok: false; reason: "rate_limited" };

/** `maxPerHour` is lifted only in demo mode, where a presenter re-tries the same demo citizen repeatedly. */
export async function sendOtp(
  db: Db,
  sender: OtpSender,
  e164: string,
  phoneHash: string,
  maxPerHour = OTP_MAX_SENDS_PER_HOUR,
): Promise<SendResult> {
  const now = new Date();
  const [existing] = await db.select().from(otpSessions).where(eq(otpSessions.phoneHash, phoneHash));
  const windowFresh = existing && now.getTime() - existing.windowStart.getTime() < 60 * 60 * 1000;
  if (windowFresh && existing.sentCount >= maxPerHour) return { ok: false, reason: "rate_limited" };

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const values = {
    codeHash: codeHash(phoneHash, code),
    expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
    attempts: 0,
    sentCount: windowFresh ? existing.sentCount + 1 : 1,
    windowStart: windowFresh ? existing.windowStart : now,
  };
  await db
    .insert(otpSessions)
    .values({ phoneHash, ...values })
    .onConflictDoUpdate({ target: otpSessions.phoneHash, set: values });
  await sender.send(e164, code);
  return { ok: true, code };
}

export async function verifyOtp(db: Db, phoneHash: string, code: string): Promise<boolean> {
  const [row] = await db.select().from(otpSessions).where(eq(otpSessions.phoneHash, phoneHash));
  if (!row || row.expiresAt < new Date() || row.attempts >= OTP_MAX_ATTEMPTS) return false;
  const expected = Buffer.from(row.codeHash);
  const actual = Buffer.from(codeHash(phoneHash, code));
  const ok = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (ok) {
    await db.delete(otpSessions).where(eq(otpSessions.phoneHash, phoneHash));
  } else {
    await db
      .update(otpSessions)
      .set({ attempts: row.attempts + 1 })
      .where(eq(otpSessions.phoneHash, phoneHash));
  }
  return ok;
}
