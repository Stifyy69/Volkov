// backend/routes/index.js
import { Router } from "express";
import authRoutes from "./auth.js";
import taxRoutes from "./tax.js";
import drillRoutes from "./drill.js";
import adminRoutes from "./admin.js";
import profileRoutes from "./profile.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/taxe", taxRoutes);
router.use("/drill", drillRoutes);
router.use("/admin", adminRoutes);
router.use("/profile", profileRoutes);

export default router;
