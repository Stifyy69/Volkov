import express from "express";
import authRouter from "./auth.js";
import taxeRouter from "./taxe.js";
import drillRouter from "./drill.js";
import statsRouter from "./stats.js";
import adminRouter from "./admin.js";

const router = express.Router();

router.use(authRouter);
router.use(taxeRouter);
router.use(drillRouter);
router.use(statsRouter);
router.use(adminRouter);

export default router;
