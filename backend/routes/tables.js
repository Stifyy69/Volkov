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

// Tabele all – doar pentru ADMIN
router.get("/", auth([Role.ADMIN]), async (req, res) => {
  try {
    const { type = "taxe", period = "week", year, week, user, cnp, family } = req.query;
    const periodAll = period === "all";
    const y = year ? Number(year) : null;
    const w = week ? Number(week) : null;

    if (type === "taxe") {
      const taxe = await prisma.taxEntry.findMany({
        include: { user: true, family: true },
        orderBy: { createdAt: "desc" },
      });

      const filtered = taxe.filter(
        (t) =>
          inWeek(periodAll, y, w, t.createdAt) &&
          (!user || t.user?.username?.includes(user)) &&
          (!cnp || t.cnp?.includes(cnp)) &&
          (!family || t.family?.name?.includes(family))
      );

      return res.json(
        filtered.map((t) => ({
          id: t.id,
          cnp: t.cnp,
          amount: t.amount,
          type: t.type,
          currency: t.currency,
          user: t.user?.username || "",
          family: t.family?.name || null,
          createdAt: t.createdAt,
        }))
      );
    } else {
      const drills = await prisma.drillJob.findMany({
        include: { user: true, family: true },
        orderBy: { createdAt: "desc" },
      });

      const filtered = drills.filter(
        (d) =>
          inWeek(periodAll, y, w, d.createdAt) &&
          (!user || d.user?.username?.includes(user)) &&
          (!cnp || d.cnp?.includes(cnp)) &&
          (!family || d.family?.name?.includes(family))
      );

      return res.json(
        filtered.map((d) => ({
          id: d.id,
          cnp: d.cnp,
          cadru: d.cadru,
          teava: d.teava,
          mecanism: d.mecanism,
          fixare: d.fixare,
          metodaPlata: d.unitPrice === 0 ? "GRATIS" : "Bani murdari",
          costTotal: d.processed * d.unitPrice,
          user: d.user?.username || "",
          family: d.family?.name || null,
          createdAt: d.createdAt,
        }))
      );
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

// DELETE – admin poate șterge fără eroare
router.delete("/:type/:id", auth([Role.ADMIN]), async (req, res) => {
  try {
    const { type, id } = req.params;
    if (type === "taxe") {
      await prisma.taxEntry.delete({ where: { id } });
    } else {
      await prisma.drillJob.delete({ where: { id } });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare la ștergere" });
  }
});

export default router;
