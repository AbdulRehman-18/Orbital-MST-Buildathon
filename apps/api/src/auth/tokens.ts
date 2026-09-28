// Access JWT (15 min, bearer) + rotating refresh session in the httpOnly `ns_session` cookie (plan §10).
import { randomBytes } from "node:crypto";
import { and, authSessions, eq, gt, isNull, type Db } from "@namma-seva/db";
import type { CookieOptions, Response } from "express";
import { jwtVerify, SignJWT } from "jose";
import { sha256Hex } from "../lib/hash";

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = "ns_session";

export type Role = "ADMIN" | "GOVT_OFFICIAL" | "AUDITOR" | "CONTRACTOR" | "CITIZEN" | "PUBLIC";

export type SessionUser = {
  id: string;
  role: Role;
  roles: Role[];
  walletAddress: string | null;
  citizenHash: string | null;
  wards: number[];
  preferredLang: string;
  demo: boolean;
};

const ISSUER = "namma-seva-api";

export class TokenService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly secureCookies: boolean,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  async signAccess(user: SessionUser): Promise<string> {
    return new SignJWT({ usr: user })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
      .sign(this.key);
  }

  async verifyAccess(token: string): Promise<SessionUser | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, algorithms: ["HS256"] });
      return (payload as { usr?: SessionUser }).usr ?? null;
    } catch {
      return null;
    }
  }

  cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.secureCookies,
      sameSite: "lax",
      path: "/api/auth",
      maxAge: REFRESH_TTL_MS,
    };
  }

  /** Creates a refresh session and sets the cookie. */
  async startSession(db: Db, res: Response, userId: string): Promise<void> {
    const token = randomBytes(32).toString("base64url");
    await db.insert(authSessions).values({
      userId,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    res.cookie(SESSION_COOKIE, token, this.cookieOptions());
  }

  /** Validates and revokes the presented refresh token (rotation). Returns its user id. */
  async consumeSession(db: Db, token: string | undefined): Promise<string | null> {
    if (!token) return null;
    const [row] = await db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(authSessions.tokenHash, sha256Hex(token)),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, new Date()),
        ),
      )
      .returning({ userId: authSessions.userId });
    return row?.userId ?? null;
  }

  clearCookie(res: Response) {
    const { maxAge: _maxAge, ...opts } = this.cookieOptions();
    res.clearCookie(SESSION_COOKIE, opts);
  }
}
