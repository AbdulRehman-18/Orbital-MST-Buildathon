import { Router, type IRouter } from "express";
import type { AppContext } from "../context";
import authRoutes from "./auth";
import chainRoutes from "./chain";
import demoRoutes from "./demo";
import grievanceRoutes from "./grievances";
import healthRoutes from "./health";
import milestoneRoutes from "./milestones";
import privacyRoutes from "./privacy";
import projectRoutes from "./projects";
import tenderRoutes from "./tenders";
import transparencyRoutes from "./transparency";

// DecentraliTrack's server-signed approve / reject / release routes are gone on purpose: those
// actions are signed in the official's / auditor's own wallet and reach us via the indexer.
export default function routes(ctx: AppContext): IRouter {
  const router: IRouter = Router();
  router.use(healthRoutes(ctx));
  router.use(authRoutes(ctx));
  router.use(projectRoutes(ctx));
  router.use(milestoneRoutes(ctx));
  router.use(grievanceRoutes(ctx));
  router.use(tenderRoutes(ctx));
  router.use(chainRoutes(ctx));
  router.use(privacyRoutes(ctx));
  router.use(transparencyRoutes(ctx));
  router.use(demoRoutes(ctx));
  return router;
}
