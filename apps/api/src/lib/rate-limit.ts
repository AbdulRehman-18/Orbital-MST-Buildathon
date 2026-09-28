import { rateLimit, type Options } from "express-rate-limit";
import type { Redis } from "ioredis";
import { RedisStore, type RedisReply } from "rate-limit-redis";

/** express-rate-limit backed by Redis when available (shared across API replicas), else memory. */
export function limiter(redis: Redis | undefined, name: string, windowMs: number, limit: number, extra: Partial<Options> = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "rate_limited", message: "Too many requests — slow down" },
    ...(redis
      ? {
          store: new RedisStore({
            prefix: `ns:rl:${name}:`,
            sendCommand: (command: string, ...args: string[]) =>
              redis.call(command, ...args) as Promise<RedisReply>,
          }),
        }
      : {}),
    ...extra,
  });
}
