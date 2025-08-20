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

// Doar pentru ADMIN
router.get("/", auth([Role.ADMIN]), async (req, res) => {
  try {
    const periodAll = req.query.period === "all";
    const year = req.query.year ? Number(req.query.year) : null;
    const week = req.query.week ? Number(req.query.week) : null;

    const taxe = await prisma.taxEntry.findMany({
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });

    const drill = await prisma.drillJob.findMany({
      include: { user: true, family: true },
      orderBy: { createdAt: "asc" },
    });

    /* --- Statistici principale --- */
    let statTaxClean = 0,
      statTaxDirty = 0,
      statDrillPieces = 0;

    taxe.forEach((t) => {
      if (!inWeek(periodAll, year, week, t.createdAt)) return;
      if (t.currency === "CLEAN") statTaxClean += t.amount;
      if (t.currency === "DIRTY") statTaxDirty += t.amount;
    });

    drill.forEach((d) => {
      if (!inWeek(periodAll, year, week, d.createdAt)) return;
      statDrillPieces += d.processed;
      statTaxDirty += d.processed * d.unitPrice;
    });

    /* --- Daily table --- */
    const daily = {};
    taxe.forEach((t) => {
      if (!inWeek(periodAll, year, week, t.createdAt)) return;
      const day = t.createdAt.toISOString().substring(0, 10);
      if (!daily[day]) daily[day] = { count: 0, clean: 0, dirty: 0 };
      daily[day].count++;
      if (t.currency === "CLEAN") daily[day].clean += t.amount;
      else daily[day].dirty += t.amount;
    });

    const dailyArr = Object.entries(daily).map(([day, v]) => ({
      day,
      nrTaxe: v.count,
      clean: v.clean,
      dirty: v.dirty,
    }));

    /* --- Familii drill --- */
    const famStats = {};
    drill.forEach((d) => {
      if (!inWeek(periodAll, year, week, d.createdAt)) return;
      const fam = d.family?.name || "-";
      if (!famStats[fam]) famStats[fam] = { cadru: 0, teava: 0, mecanism: 0, fixare: 0 };
      famStats[fam].cadru += d.cadru;
      famStats[fam].teava += d.teava;
      famStats[fam].mecanism += d.mecanism;
      famStats[fam].fixare += d.fixare;
    });

    const famArr = Object.entries(famStats).map(([fam, v]) => ({
      familie: fam,
      cadru: v.cadru,
      teava: v.teava,
      mecanism: v.mecanism,
      fixare: v.fixare,
      total: v.cadru + v.teava + v.mecanism + v.fixare,
    }));

    /* --- Top useri taxe --- */
    const userTaxe = {};
    taxe.forEach((t) => {
      if (!inWeek(periodAll, year, week, t.createdAt)) return;
      const u = t.user?.username || "-";
      if (!userTaxe[u]) userTaxe[u] = { count: 0, sum: 0 };
      userTaxe[u].count++;
      userTaxe[u].sum += t.amount;
    });

    const topTaxe = Object.entries(userTaxe)
      .map(([u, v]) => ({ user: u, count: v.count, sum: v.sum }))
      .sort((a, b) => b.count - a.count);

    /* --- Top useri drill --- */
    const userDrill = {};
    drill.forEach((d) => {
      if (!inWeek(periodAll, year, week, d.createdAt)) return;
      const u = d.user?.username || "-";
      if (!userDrill[u]) userDrill[u] = { val: 0 };
      userDrill[u].val += d.processed * d.unitPrice;
    });

    const topDrill = Object.entries(userDrill)
      .map(([u, v]) => ({ user: u, val: v.val }))
      .sort((a, b) => b.val - a.val);

    res.json({
      statTaxClean,
      statTaxDirty,
      statDrillPieces,
      daily: dailyArr,
      familii: famArr,
      topTaxe,
      topDrill,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
