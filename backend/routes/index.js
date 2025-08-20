import { Router } from "express";
import auth from "./auth.js";
import taxe from "./taxe.js";
import drill from "./drill.js";
import dashboard from "./dashboard.js";
import families from "./families.js";
import admin from "./admin.js";
import tables from "./tables.js";
import profile from "./profile.js";

const router = Router();

router.use("/auth", auth);
router.use("/taxe", taxe);
router.use("/drill", drill);
router.use("/dashboard", dashboard);
router.use("/families", families);
router.use("/admin", admin);
router.use("/tables", tables);
router.use("/profile", profile);

export default router;
