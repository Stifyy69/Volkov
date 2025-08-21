// backend/routes/profile.js
import { Router } from "express";
import prisma from "../db.js";
import { auth } from "../utils.js";

const router = Router();

/**
 * GET /profile
 * Datele user-ului logat (taxe + burghiu) filtrate pe săptămână/all
 */
router.get("/", auth(), async (req, res) => {
  try {
    const periodAll = req.query.period === "all";
    const selYear = req.query.year ? Number(req.query.year) : null;
    const selWeek = req.query.week ? Number(req.query.week) : null;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { taxEntries: true, drillJobs: true },
    });

    function inISOWeek(d) {
      if (periodAll || !selYear || !selWeek) return true;
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const day = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
      const year = date.getUTCFullYear();
      return year === selYear && weekNo === selWeek;
    }

    const taxe = user.taxEntries.filter((t) => inISOWeek(t.createdAt));
    const drills = user.drillJobs.filter((d) => inISOWeek(d.createdAt));

    const clean = taxe.filter((t) => t.currency === "CLEAN").length * 40000;
    const dirty = taxe.filter((t) => t.currency === "DIRTY").length * 60000 +
                  drills.reduce((sum, d) => sum + d.processed * d.unitPrice, 0);

    res.json({
      username: user.username,
      role: user.role,
      totalClean: clean,
      totalDirty: dirty,
      total: clean + dirty,
      taxe,
      drills,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
