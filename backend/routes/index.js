import express from "express";

import auth from "./auth.js";
import taxe from "./taxe.js";
import drill from "./drill.js";
import statsTaxe from "./stats-taxe.js";
import statsFam from "./stats-fam.js";
import tables from "./tables.js";

const router = express.Router();

router.use("/auth", auth);
router.use("/taxe", taxe);
router.use("/drill", drill);
router.use("/stats-taxe", statsTaxe);
router.use("/stats-fam", statsFam);
router.use("/tables", tables);

// Fallback 404 pentru rutele neacoperite în acest grup
router.use((_req, res) => res.status(404).json({ error: "not found" }));

export default router;
