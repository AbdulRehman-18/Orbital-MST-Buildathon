import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { authenticate } from "./auth/middleware";
import type { AppContext } from "./context";
import { errorHandler } from "./lib/http";
import { limiter } from "./lib/rate-limit";
import routes from "./routes";

export function createApp(ctx: AppContext): Express {
  const app: Express = express();
  const { config } = ctx;

  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", config.trustProxy);
  app.use(
    pinoHttp({
      logger: ctx.logger,
      genReqId: (req, res) => {
        const incoming = req.headers["x-request-id"];
        const id = typeof incoming === "string" && /^[\w-]{1,64}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url?.split("?")[0] }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      autoLogging: { ignore: (req) => req.url === "/api/health" },
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());

  // Redis-backed limits (plan §9.6): a general ceiling plus tighter ones on auth.
  app.use("/api", limiter(ctx.redis, "api", 60_000, 300));
  app.use("/api/auth", limiter(ctx.redis, "auth", 60_000, 30));
  app.use("/api/auth/otp/send", limiter(ctx.redis, "otp", 10 * 60_000, 5));

  app.use("/api", authenticate(ctx.tokens));
  app.use("/api", routes(ctx));
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });
  app.use(errorHandler);

  return app;
}
