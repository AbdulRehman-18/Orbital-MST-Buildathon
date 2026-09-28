import type { NextFunction, Request, RequestHandler, Response } from "express";
import { forbidden, unauthorized } from "../lib/http";
import type { Role, SessionUser, TokenService } from "./tokens";

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

/** Attaches `req.user` from a valid bearer token; anonymous requests pass through. */
export function authenticate(tokens: TokenService): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      const user = await tokens.verifyAccess(header.slice(7));
      if (user) req.user = user;
    }
    next();
  };
}

/**
 * Requires a signed-in user holding one of `roles` (any role when empty). This is a UX gate only —
 * every privileged action is re-checked on-chain when the wallet signs it.
 */
export function requireAuth(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (roles.length && !roles.some((r) => req.user!.roles.includes(r))) {
      return next(forbidden(`Requires role: ${roles.join(" | ")}`));
    }
    next();
  };
}
