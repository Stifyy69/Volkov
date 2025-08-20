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

/* ========================= TABEL TAXE ========================= */
router.get("/taxe", auth(), adminOnly, async (req, res) => {
  try {
    const periodAll = req.query.period === "all";
    const year = req.query.year ? Number(req.query.year) : null;
    const week = req.query.week ? Number(req.query.week) : null;

    const list = await prisma.taxEntry.findMany({
      include: { user: true, family: true },
      orderBy: { createdAt: "desc" },
    });

    res.json(
      list
        .filter((t) => inRange(periodAll, year, week, t.createdAt))
        .map((t) => ({
          id: t.id,
          cnp: t.cnp,
          amount: t.amount,
          payment: t.payment,
          currency: t.currency,
          user: t.user?.username || "",
          family: t.family?.name || null,
          createdAt: t.createdAt,
        }))
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

/* ========================= TABEL BURGHIU ========================= */
router.get("/drill", auth(), adminOnly, async (req, res) => {
  try {
    const periodAll = req.query.period === "all";
    const year = req.query.year ? Number(req.query.year) : null;
    const week = req.query.week ? Number(req.query.week) : null;

    const list = await prisma.drillJob.findMany({
      include: { user: true, family: true },
      orderBy: { createdAt: "desc" },
    });

    res.json(
      list
        .filter((j) => inRange(periodAll, year, week, j.createdAt))
        .map((j) => ({
          id: j.id,
          cnp: j.cnp,
          cadru: j.cadru,
          teava: j.teava,
          mecanism: j.mecanism,
          fixare: j.fixare,
          costTotal: j.processed * j.unitPrice,
          metodaPlata: j.unitPrice === 0 ? "GRATIS" : "Bani murdari",
          user: j.user?.username || "",
          family: j.family?.name || null,
          createdAt: j.createdAt,
        }))
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

/* ====================== ȘTERGERE ÎNTRARE ======================== */
router.delete("/:type/:id", auth(), adminOnly, async (req, res) => {
  try {
    const { type, id } = req.params;
    if (type === "taxe") {
      await prisma.taxEntry.delete({ where: { id } });
    } else if (type === "drill") {
      await prisma.drillJob.delete({ where: { id } });
    } else {
      return res.status(400).json({ error: "tip invalid" });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare la ștergere" });
  }
});

export default router;
