import express from "express";
import prisma, { isoWeekRange } from "../db.js";
import { TaxType } from "@prisma/client";
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

function amountFor(entry) {
  if (entry.payment === "gratis") return { clean: 0, dirty: 0 };
  if (entry.currency === "CLEAN") return { clean: 40000, dirty: 0 };
  return { clean: 0, dirty: 60000 };
}

router.get("/summary", auth(), adminOnly, async (req, res) => {
  try {
    const periodAll = req.query.period === "all";
    const year = req.query.year ? Number(req.query.year) : null;
    const week = req.query.week ? Number(req.query.week) : null;

    const list = await prisma.taxEntry.findMany({
      where: { type: TaxType.TAXA },
      select: { createdAt: true, payment: true, currency: true },
      orderBy: { createdAt: "desc" },
    });

    let clean = 0, dirty = 0, count = 0;
    for (const t of list) {
      if (!inRange(periodAll, year, week, t.createdAt)) continue;
      const { clean: c, dirty: d } = amountFor(t);
      clean += c; dirty += d;
      count += 1;
    }

    res.json({ count, clean, dirty, total: clean + dirty });
  } catch (e) {
    res.status(500).json({ error: "eroare server" });
  }
});

router.get("/daily", auth(), adminOnly, async (req, res) => {
  try {
    const periodAll = req.query.period === "all";
    const year = req.query.year ? Number(req.query.year) : null;
    const week = req.query.week ? Number(req.query.week) : null;

    const days = [
      { key: 1, name: "Luni" }, { key: 2, name: "Marți" }, { key: 3, name: "Miercuri" },
      { key: 4, name: "Joi" }, { key: 5, name: "Vineri" }, { key: 6, name: "Sâmbătă" },
      { key: 0, name: "Duminică" },
    ];
    const agg = new Map(days.map(d => [d.key, { day: d.name, count: 0, clean: 0, dirty: 0 }]));

    const list = await prisma.taxEntry.findMany({
      where: { type: TaxType.TAXA },
      select: { createdAt: true, payment: true, currency: true },
      orderBy: { createdAt: "asc" },
    });

    for (const t of list) {
      if (!inRange(periodAll, year, week, t.createdAt)) continue;
      const dkey = t.createdAt.getUTCDay();
      const row = agg.get(dkey);
      if (!row) continue;
      const { clean: c, dirty: d } = amountFor(t);
      row.count += 1; row.clean += c; row.dirty += d;
    }

    const out = [1,2,3,4,5,6,0].map(k => agg.get(k));
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: "eroare server" });
  }
});

router.get("/top-users", auth(), adminOnly, async (req, res) => {
  try {
    const periodAll = req.query.period === "all";
    const year = req.query.year ? Number(req.query.year) : null;
    const week = req.query.week ? Number(req.query.week) : null;

    const list = await prisma.taxEntry.findMany({
      where: { type: TaxType.TAXA },
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: "desc" },
    });

    const byUser = new Map();
    for (const t of list) {
      if (!inRange(periodAll, year, week, t.createdAt)) continue;
      const uid = t.user?.id || "unknown";
      const uname = t.user?.username || "unknown";
      if (!byUser.has(uid)) byUser.set(uid, { userId: uid, user: uname, taxesCount: 0, cleanAmount: 0, dirtyAmount: 0, totalAmount: 0 });
      const row = byUser.get(uid);
      row.taxesCount += 1;
      const { clean: c, dirty: d } = amountFor(t);
      row.cleanAmount += c; row.dirtyAmount += d; row.totalAmount += c + d;
    }

    const out = Array.from(byUser.values()).sort((a,b) => b.totalAmount - a.totalAmount);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
