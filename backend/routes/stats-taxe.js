import express from "express";
import prisma from "../db.js";
import { Role, TaxType, Currency } from "@prisma/client";
import { auth, requireRole, parsePeriodQuery } from "../utils.js";

const router = express.Router();

/* GET /stats/taxe/summary
   Query:
     - period=all    (sau)
     - year=YYYY&week=WW  (ISO)
   Răspunde cu:
     {
       period: {periodAll, year, week, start, end},
       totals: { clean, dirty, all },
       daily: [{ day, date, count, clean, dirty }, ... 7],
       topUsers: [{ username, count, amount }]
     }
*/
router.get("/summary", auth(), requireRole(Role.ADMIN), async (req, res) => {
  try {
    const { periodAll, start, end, year, week } = parsePeriodQuery(req.query);

    const where = {
      type: TaxType.TAXA,
      ...(periodAll ? {} : { createdAt: { gte: start, lt: end } }),
    };

    const rows = await prisma.taxEntry.findMany({
      where,
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: "asc" },
    });

    // inițializări
    const roDays = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"];
    const daily = Array.from({ length: 7 }, (_, i) => ({
      day: roDays[i],
      date: null,
      count: 0,
      clean: 0,
      dirty: 0,
    }));

    const topMap = new Map();
    let totalClean = 0;
    let totalDirty = 0;

    for (const r of rows) {
      // daily
      const d = new Date(r.createdAt);
      const dow = ((d.getUTCDay() || 7) - 1); // 0..6 Luni..Duminică
      if (!periodAll && !daily[dow].date) {
        // pune data calendaristică pentru ziua respectivă
        const theDate = new Date(start);
        theDate.setUTCDate(start.getUTCDate() + dow);
        daily[dow].date = theDate.toISOString().slice(0, 10);
      }
      daily[dow].count += 1;
      if (r.currency === Currency.CLEAN) {
        daily[dow].clean += Number(r.amount || 0);
        totalClean += Number(r.amount || 0);
      } else if (r.currency === Currency.DIRTY) {
        daily[dow].dirty += Number(r.amount || 0);
        totalDirty += Number(r.amount || 0);
      }

      // top users
      const uname = r.user?.username || "—";
      const prev = topMap.get(uname) || { username: uname, count: 0, amount: 0 };
      prev.count += 1;
      prev.amount += Number(r.amount || 0);
      topMap.set(uname, prev);
    }

    const topUsers = Array.from(topMap.values())
      .sort((a, b) => (b.amount - a.amount) || (b.count - a.count))
      .slice(0, 50);

    res.json({
      period: {
        periodAll,
        year: periodAll ? null : year,
        week: periodAll ? null : week,
        start: periodAll ? null : start.toISOString(),
        end: periodAll ? null : end.toISOString(),
      },
      totals: {
        clean: totalClean,
        dirty: totalDirty,
        all: totalClean + totalDirty,
      },
      daily,
      topUsers,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
