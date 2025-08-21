// backend/routes/stats.js
import { Router } from "express";
import prisma from "../db.js";
import { auth, requireRole } from "../utils.js";
import { Role } from "@prisma/client";

const router = Router();

/**
 * GET /stats
 * Returnează statistici agregate per user
 */
router.get("/", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR, Role.AUDIT), async (req, res) => {
  try {
    const periodAll = req.query.period === "all";
    const selYear = req.query.year ? Number(req.query.year) : null;
    const selWeek = req.query.week ? Number(req.query.week) : null;

    const users = await prisma.user.findMany({
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

    const out = users.map((u) => {
      let clean = 0, dirty = 0;
      for (const t of u.taxEntries) {
        if (!inISOWeek(t.createdAt)) continue;
        if (t.payment === "gratis") continue;
        if (t.currency === "CLEAN") clean += 40000;
        else if (t.currency === "DIRTY") dirty += 60000;
      }
      for (const d of u.drillJobs) {
        if (!inISOWeek(d.createdAt)) continue;
        dirty += d.processed * d.unitPrice;
      }
      const total = clean + dirty;
      return {
        user: u.username,
        role: u.role,
        totalClean: clean,
        totalDirty: dirty,
        total,
      };
    });

    out.sort((a, b) => b.total - a.total);
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
