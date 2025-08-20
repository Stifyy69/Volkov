import { Router } from "express";

import auth from "./auth.js";
import taxe from "./taxe.js";
import drill from "./drill.js";
import dashboard from "./dashboard.js";
import families from "./families.js";
import admin from "./admin.js";
import tables from "./tables.js";
import profile from "./profile.js";

import stats from "./stats.js";
import statsFam from "./stats-fam.js";
import statsFamilii from "./stats-familii.js";
import statsTaxe from "./stats-taxe.js";

const router = Router();

// Public/auth
router.use("/auth", auth);

// Core features
router.use("/taxe", taxe);
router.use("/drill", drill);

// Aggregated stats & admin
router.use("/dashboard", dashboard);
router.use("/families", families);
router.use("/admin", admin);

// Utilities
router.use("/tables", tables);
router.use("/profile", profile);

// New stats endpoints
router.use("/stats", stats);
router.use("/stats-fam", statsFam);
router.use("/stats-familii", statsFamilii);
router.use("/stats-taxe", statsTaxe);

export default router;
