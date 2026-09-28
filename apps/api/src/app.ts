import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { config } from "./config";
import { logger } from "./lib/logger";
import router from "./routes";

const app: Express = express();

app.disable("x-powered-by");
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = (req.headers["x-request-id"] as string | undefined) ?? randomUUID();
      res.setHeader("x-request-id", id);
      return id;
    },
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url?.split("?")[0] }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }),
);
app.use(helmet());
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.use("/api", router);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "not_found" });
});

export default app;
