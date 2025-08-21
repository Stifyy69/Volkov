// backend/routes/tables.js
import { Router } from "express";
import prisma from "../db.js";
import { auth } from "../utils.js";

const router = Router();

/**
 * GET /tables
 * Returnează toate intrările (taxe + burghiu)
 * Filtrare pe ?year=YYYY&week=WW sau ?period=all
 */
router.get("/", auth(), async (req, res) => {
  try {
    const periodAll = req.query.period === "all";
    const selYear = req.query.year ? Number(req.query.year) : null;
    const selWeek = req.query.week ? Number(req.query.week) : null;

    const taxEntries = await prisma.taxEntry.findMany({
      include: { family: true, user: true },
      orderBy: { createdAt: "desc" },
    });
    const drills = await prisma.drillJob.findMany({
      include: { family: true, user: true },
      orderBy: { createdAt: "desc" },
    });

    // filtrare săptămână
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

    const taxe = taxEntries
      .filter((t) => inISOWeek(t.createdAt))
      .map((t) => ({
        id: t.id,
        type: "TAXA",
        user: t.user?.username,
        cnp: t.cnp,
        familie: t.family?.name,
        tip: t.payment,
        amount: t.amount,
        createdAt: t.createdAt,
      }));

    const burghiu = drills
      .filter((d) => inISOWeek(d.createdAt))
      .map((d) => ({
        id: d.id,
        type: "BURGHIU",
        user: d.user?.username,
        cnp: d.cnp,
        familie: d.family?.name,
        tip: d.unitPrice === 0 ? "GRATIS" : "Bani murdari",
        amount: d.processed * d.unitPrice,
        createdAt: d.createdAt,
      }));

    res.json([...taxe, ...burghiu].sort((a, b) => b.createdAt - a.createdAt));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
