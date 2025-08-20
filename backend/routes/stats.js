// backend/routes/stats.js
import express from "express";
import prisma from "../db.js";
import { auth, requireRole } from "../utils.js";
import { Role } from "@prisma/client";

const router = express.Router();

// --------------------- Helper: calcul ISO week --------------------- //
function getISOWeekYear(date) {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  return { year: tmp.getUTCFullYear(), week: weekNo };
}

function inISOWeek(date, year, week) {
  const { year: y, week: w } = getISOWeekYear(date);
  return y === year && w === week;
}

// ------------------------- Stats endpoint -------------------------- //
// /admin/stats?year=YYYY&week=WW sau ?period=all
router.get(
  "/",
  auth(),
  requireRole(Role.ADMIN, Role.HEAD_OPERATOR, Role.AUDIT),
  async (req, res) => {
    try {
      const periodAll = req.query.period === "all";
      const selYear = req.query.year ? Number(req.query.year) : null;
      const selWeek = req.query.week ? Number(req.query.week) : null;

      const users = await prisma.user.findMany({
        include: {
          taxEntries: true,
          drillJobs: true,
        },
      });

      const out = users.map((u) => {
        let clean = 0, dirty = 0;

        // taxe
        for (const t of u.taxEntries) {
          if (t.type !== "TAXA") continue;
          if (!periodAll && selYear && selWeek && !inISOWeek(t.createdAt, selYear, selWeek)) continue;
          if (t.payment === "gratis") continue;
          if (t.currency === "CLEAN") clean += 40000;
          else if (t.currency === "DIRTY") dirty += 60000;
        }

        // drill
        for (const d of u.drillJobs) {
          if (!periodAll && selYear && selWeek && !inISOWeek(d.createdAt, selYear, selWeek)) continue;
          dirty += d.processed * d.unitPrice;
        }

        const total = clean + dirty;
        return {
          id: u.id,
          username: u.username,
          role: u.role,
          userShareClean: clean * 0.5,
          userShareDirty: dirty * 0.5,
          familyShareClean: clean * 0.5,
          familyShareDirty: dirty * 0.5,
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
  }
);

export default router;
