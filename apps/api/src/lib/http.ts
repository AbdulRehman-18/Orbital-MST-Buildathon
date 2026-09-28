import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError, type ZodType, type z } from "zod";

/** Throw from a handler to send `{ error, message }` with the given status. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
    readonly details?: unknown,
  ) {
    super(message ?? code);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, "bad_request", message, details);
export const unauthorized = (message = "Sign in required") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "Not allowed") => new HttpError(403, "forbidden", message);
export const notFound = (message = "Not found") => new HttpError(404, "not_found", message);
export const conflict = (message: string) => new HttpError(409, "conflict", message);
export const tooMany = (message: string) => new HttpError(429, "rate_limited", message);
export const unavailable = (message: string) => new HttpError(503, "unavailable", message);

/** Parse with a generated api-zod schema; 400 with the issues on failure. */
export function parse<S extends ZodType>(schema: S, value: unknown): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw badRequest("Validation failed", r.error.issues);
  return r.data;
}

/** Express 5 forwards rejected promises to the error handler; this just keeps handler types tidy. */
export const handler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown): RequestHandler =>
  async (req, res, next) => {
    await fn(req, res, next);
  };

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "bad_request", message: "Validation failed", details: err.issues });
    return;
  }
  const e = err as { type?: string; status?: number; code?: string };
  if (e?.type === "entity.parse.failed") {
    res.status(400).json({ error: "bad_request", message: "Malformed JSON" });
    return;
  }
  if (e?.code === "LIMIT_FILE_SIZE" || e?.code === "LIMIT_FILE_COUNT" || e?.code === "LIMIT_UNEXPECTED_FILE") {
    res.status(400).json({ error: "bad_request", message: (err as Error).message });
    return;
  }
  req.log?.error({ err }, "Unhandled error");
  res.status(500).json({ error: "internal", message: "Internal server error" });
}
