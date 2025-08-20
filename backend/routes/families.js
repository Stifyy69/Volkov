import express from "express";
import prisma, { isoWeekRange } from "../db.js";
import { auth } from "../utils.js";
import { Role } from "@prisma/client";

const router = express.Router();

function inWeek(periodAll, year, week, d) {
  if (periodAll || !year || !week) return true;
  const { start, end } = isoWeekRange(year, week);
  return d >= start && d < end;
}

// Statistici familii – doar pentru ADMIN
router.get("/", auth([Role.ADMIN]), async (req, res) => {
  try {
    const periodAll = req.query.period === "all";
    const year = req.query.year ? Number(req.query.year) : null;
    const week = req.query.week ? Number(req.query.week) : null;

    const drill = await prisma.drillJob.findMany({
      include: { family: true, user: true },
    });

    const famStats = {};
    const userStats = {};

    drill.forEach((d) => {
      if (!inWeek(periodAll, year, week, d.createdAt)) return;

      const fam = d.family?.name || "-";
      if (!famStats[fam]) famStats[fam] = { cadru: 0, teava: 0, mecanism: 0, fixare: 0 };
      famStats[fam].cadru += d.cadru;
      famStats[fam].teava += d.teava;
      famStats[fam].mecanism += d.mecanism;
      famStats[fam].fixare += d.fixare;

      const u = d.user?.username || "-";
      if (!userStats[u]) userStats[u] = { total: 0 };
      userStats[u].total += d.processed;
    });

    const familii = Object.entries(famStats).map(([fam, v]) => ({
      familie: fam,
      cadru: v.cadru,
      teava: v.teava,
      mecanism: v.mecanism,
      fixare: v.fixare,
      total: v.cadru + v.teava + v.mecanism + v.fixare,
    }));

    const userArr = Object.entries(userStats)
      .map(([u, v]) => ({ user: u, total: v.total }))
      .sort((a, b) => b.total - a.total);

    res.json({ familii, useri: userArr });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
