// backend/routes/index.js
import { Router } from "express";
import authRoutes from "./auth.js";
import inviteRoutes from "./invites.js";
import taxeRoutes from "./taxe.js";
import drillRoutes from "./drill.js";
import adminRoutes from "./admin.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/invites", inviteRoutes);
router.use("/taxe", taxeRoutes);
router.use("/drill", drillRoutes);
router.use("/admin", adminRoutes);

export default router;
