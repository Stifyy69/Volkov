import express from "express";
import prisma, { isoWeekRange } from "../db.js";
import { auth } from "../utils.js";

const router = express.Router();

function inRange(periodAll, year, week, d) {
  if (periodAll || !year || !week) return true;
  const { start, end } = isoWeekRange(year, week);
  return d >= start && d < end;
}

// Helper: key YYYY-MM-DD in UTC
function dayKeyUTC(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * GET /profile/stats
 * Query:
 *   period = "week" | "all"   (default "week")
 *   year   = YYYY              (required if period=week)
 *   week   = WW                (required if period=week)
 *
 * Return:
 *   {
 *     totals: {
 *       clean, dirty, drillPieces, drillMoney,
 *       split: {
 *         cleanUser, cleanFamily, dirtyUser, dirtyFamily,
 *         totalUser, totalFamily, totalAll
 *       }
 *     },
 *     daily: [{ day, taxesCount, cleanUser, dirtyUser }],
 *   }
 * NOTE: *_User values are 50% partea operatorului (restul la familie).
 */
router.get("/stats", auth(), async (req, res) => {
  try {
    const periodAll = req.query.period === "all";
    const year = req.query.year ? Number(req.query.year) : null;
    const week = req.query.week ? Number(req.query.week) : null;

    // Pull user-specific data
    const [taxes, drills] = await Promise.all([
      prisma.taxEntry.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "asc" },
      }),
      prisma.drillJob.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    // Aggregate
    let clean = 0;   // full amounts (before 50/50)
    let dirty = 0;   // full amounts (before 50/50)
    let drillPieces = 0;
    let drillMoney = 0;

    const dailyMap = new Map();
    function upsertDay(key) {
      if (!dailyMap.has(key)) {
        dailyMap.set(key, { day: key, taxesCount: 0, cleanUser: 0, dirtyUser: 0 });
      }
      return dailyMap.get(key);
    }

    // TAXE: count & sums (ignore gratis for money)
    for (const t of taxes) {
      if (!inRange(periodAll, year, week, t.createdAt)) continue;
      const key = dayKeyUTC(t.createdAt);
      const row = upsertDay(key);

      // count any TAXA entries as a "taxă" for daily table
      if (t.type === "TAXA") {
        row.taxesCount += 1;
      }

      // money
      if (t.payment === "gratis") continue;
      const amt = typeof t.amount === "number" && t.amount > 0
        ? t.amount
        : (t.currency === "CLEAN" ? 40000 : 60000);

      if (t.currency === "CLEAN") {
        clean += amt;
        row.cleanUser += amt * 0.5;
      } else {
        dirty += amt;
        row.dirtyUser += amt * 0.5;
      }
    }

    // DRILL: pieces and money (dirty); gratis => 0 money
    for (const d of drills) {
      if (!inRange(periodAll, year, week, d.createdAt)) continue;
      const key = dayKeyUTC(d.createdAt);
      const row = upsertDay(key);

      drillPieces += d.processed || 0;
      const money = (d.processed || 0) * (d.unitPrice || 0);
      drillMoney += money;
      dirty += money;              // drill contributes to dirty pot
      row.dirtyUser += money * 0.5;
    }

    // Compose daily array sorted asc by day
    const daily = Array.from(dailyMap.values()).sort((a, b) =>
      a.day.localeCompare(b.day)
    );

    // Splits
    const split = {
      cleanUser: clean * 0.5,
      cleanFamily: clean * 0.5,
      dirtyUser: dirty * 0.5,
      dirtyFamily: dirty * 0.5,
      totalUser: (clean + dirty) * 0.5,
      totalFamily: (clean + dirty) * 0.5,
      totalAll: clean + dirty,
    };

    res.json({
      totals: { clean, dirty, drillPieces, drillMoney, split },
      daily,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
