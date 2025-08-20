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

/* =========================== SPLIT PE UTILIZATORI =========================== */
/*
  GET /admin/split?period=week|all&year=YYYY&week=WW
  Răspuns (array sortat desc după total):
  [
    {
      id, user, role,
      userShareClean, userShareDirty,
      familyShareClean, familyShareDirty,
      totalClean, totalDirty, total
    }
  ]
*/
router.get("/split", auth(), adminOnly, async (req, res) => {
  try {
    const periodAll = req.query.period === "all";
    const year = req.query.year ? Number(req.query.year) : null;
    const week = req.query.week ? Number(req.query.week) : null;

    // aducem utilizatori cu relații pentru calcule
    const users = await prisma.user.findMany({
      include: {
        taxEntries: true,   // TAXA / BURGHIU
        drillJobs: true,    // detalii piese / unitPrice
      },
    });

    const out = users.map((u) => {
      let clean = 0;
      let dirty = 0;

      // TAXE (TAXA) – 40k curat / 60k murdar – ignorăm „gratis”
      for (const t of u.taxEntries) {
        if (t.type !== "TAXA") continue;
        if (!inRange(periodAll, year, week, t.createdAt)) continue;
        if (t.payment === "gratis") continue;
        if (t.currency === "CLEAN") clean += 40000;
        else if (t.currency === "DIRTY") dirty += 60000;
      }

      // BURGHIU (din drillJobs) – mereu murdar; gratis = unitPrice 0
      for (const j of u.drillJobs) {
        if (!inRange(periodAll, year, week, j.createdAt)) continue;
        dirty += (j.processed || 0) * (j.unitPrice || 0);
      }

      const total = clean + dirty;

      return {
        id: u.id,
        user: u.username,
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
});

/* ============================== INVITE LINKS =============================== */
/*
  POST /admin/invites  { role?: "OPERATOR"|"HEAD_OPERATOR"|"ADMIN"|"AUDIT" }
  GET  /admin/invites  -> ultimele 50
*/
router.post("/invites", auth(), adminOnly, async (req, res) => {
  try {
    const role = ["OPERATOR", "HEAD_OPERATOR", "ADMIN", "AUDIT"].includes(req.body?.role)
      ? req.body.role
      : "OPERATOR";
    const code = Math.random().toString(36).slice(2, 10).toUpperCase();

    const inv = await prisma.invite.create({
      data: { code, role, createdById: req.user.id },
    });

    // dacă frontend are origin, compune link; altfel returnăm doar codul
    const linkBase = req.headers.origin || "";
    res.json({
      id: inv.id,
      code: inv.code,
      role: inv.role,
      createdAt: inv.createdAt,
      link: linkBase ? `${linkBase}/?invite=${inv.code}` : null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

router.get("/invites", auth(), adminOnly, async (_req, res) => {
  try {
    const list = await prisma.invite.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
