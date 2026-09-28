import { Router, type IRouter } from "express";
import health from "./health";

const router: IRouter = Router();
router.use(health);

export default router;
