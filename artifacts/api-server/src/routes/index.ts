import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import studioRouter from "./studio";
import storageRouter from "./storage";
import templateIdeasRouter from "./templateIdeas";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(storageRouter);
router.use(studioRouter);
router.use(templateIdeasRouter);

export default router;
