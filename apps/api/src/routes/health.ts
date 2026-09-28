import { Router, type IRouter } from "express";
import { config } from "../config";

const router: IRouter = Router();
const startedAt = new Date().toISOString();

/** Liveness. `/api/ready` (DB + RPC + indexer lag) arrives in Phase 3. */
router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "namma-seva-api",
    startedAt,
    demoMode: config.demoMode,
    chain: { name: config.network.name, chainId: config.network.id },
  });
});

export default router;
