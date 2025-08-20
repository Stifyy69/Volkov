// backend/routes/stats.js
import express from "express";
import prisma from "../db.js";
import { auth, requireRole } from "../utils.js";
import { Role } from "@prisma/client";

const router = express.Router();

/* ---------------------------- Admin weekly stats --------------------------- */
// ?year=YYYY&week=WW  -> săptămâna selectată
// ?period=all        -> all time
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

      // funcție de filtrare pe săptămână (UTC ISO)
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

        // taxe (curat/murdar/gratis)
        for (const t of u.taxEntries) {
          if (t.type !== "TAXA") continue;
          if (!inISOWeek(t.createdAt)) continue;
          if (t.payment === "gratis") continue;
          if (t.currency === "CLEAN") clean += 40000;
          else if (t.currency === "DIRTY") dirty += 60000;
        }

        // drill (mereu murdar; gratis = 0)
        for (const d of u.drillJobs) {
          if (!inISOWeek(d.createdAt)) continue;
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
