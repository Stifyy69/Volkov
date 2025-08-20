import express from "express";
import prisma, { isoWeekRange } from "../db.js";
import { auth } from "../utils.js";

const router = express.Router();

const ALLOWED_ROLES = new Set(["ADMIN", "HEAD_OPERATOR", "AUDIT"]);
function adminOnly(req, res, next) {
  if (!req.user || !ALLOWED_ROLES.has(req.user.role)) return res.status(403).json({ error: "forbidden" });
  next();
}

function inRange(periodAll, year, week, d) {
  if (periodAll || !year || !week) return true;
  const { start, end } = isoWeekRange(year, week);
  return d >= start && d < end;
}

/* --------------------------- Familii – agregate --------------------------- */
/*
  Output: [{ family, cadru, teava, mecanism, fixare, totalPieces }]
*/
router.get("/families", auth(), adminOnly, async (req, res) => {
  try {
    const periodAll = req.query.period === "all";
    const year = req.query.year ? Number(req.query.year) : null;
    const week = req.query.week ? Number(req.query.week) : null;

    const jobs = await prisma.drillJob.findMany({
      include: { family: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });

    const byFam = new Map();
    for (const j of jobs) {
      if (!inRange(periodAll, year, week, j.createdAt)) continue;
      const fname = j.family?.name || "(fără familie)";
      if (!byFam.has(fname)) byFam.set(fname, { family: fname, cadru: 0, teava: 0, mecanism: 0, fixare: 0, totalPieces: 0 });
      const row = byFam.get(fname);
      row.cadru += j.cadru || 0;
      row.teava += j.teava || 0;
      row.mecanism += j.mecanism || 0;
      row.fixare += j.fixare || 0;
      row.totalPieces += (j.cadru||0) + (j.teava||0) + (j.mecanism||0) + (j.fixare||0);
    }

    const out = Array.from(byFam.values()).sort((a,b) => b.totalPieces - a.totalPieces);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: "eroare server" });
  }
});

/* ---------------------------- Top operatori ------------------------------- */
/*
  Output: [{ userId, user, cadru, teava, mecanism, fixare, totalPieces }]
*/
router.get("/top-users", auth(), adminOnly, async (req, res) => {
  try {
    const periodAll = req.query.period === "all";
    const year = req.query.year ? Number(req.query.year) : null;
    const week = req.query.week ? Number(req.query.week) : null;

    const jobs = await prisma.drillJob.findMany({
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: "desc" },
    });

    const byUser = new Map();
    for (const j of jobs) {
      if (!inRange(periodAll, year, week, j.createdAt)) continue;
      const uid = j.user?.id || "unknown";
      const uname = j.user?.username || "unknown";
      if (!byUser.has(uid)) byUser.set(uid, { userId: uid, user: uname, cadru: 0, teava: 0, mecanism: 0, fixare: 0, totalPieces: 0 });
      const row = byUser.get(uid);
      row.cadru += j.cadru || 0;
      row.teava += j.teava || 0;
      row.mecanism += j.mecanism || 0;
      row.fixare += j.fixare || 0;
      row.totalPieces += (j.cadru||0) + (j.teava||0) + (j.mecanism||0) + (j.fixare||0);
    }

    const out = Array.from(byUser.values()).sort((a,b) => b.totalPieces - a.totalPieces);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
