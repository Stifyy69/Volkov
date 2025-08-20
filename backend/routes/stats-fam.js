import express from "express";
import prisma from "../db.js";
import { Role } from "@prisma/client";
import { auth, requireRole, parsePeriodQuery } from "../utils.js";

const router = express.Router();

/* GET /stats/fam/summary
   Query:
     - period=all  (sau)
     - year=YYYY&week=WW
   Răspunde cu:
     {
       period: { periodAll, year, week, start, end },
       families: [
         { family, cadru, teava, mecanism, fixare, total }
       ],
       topUsers: [
         { username, cadru, teava, mecanism, fixare, total }
       ]
     }
*/
router.get("/summary", auth(), requireRole(Role.ADMIN), async (req, res) => {
  try {
    const { periodAll, start, end, year, week } = parsePeriodQuery(req.query);

    const where = periodAll
      ? {}
      : { createdAt: { gte: start, lt: end } };

    // === Agregare pe familii (din DrillJob) ===
    const famRows = await prisma.drillJob.findMany({
      where,
      include: {
        family: { select: { name: true } },
        user: { select: { username: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const famMap = new Map();   // key: family name
    const userMap = new Map();  // key: username

    for (const r of famRows) {
      const famName = r.family?.name || "—";
      const uname   = r.user?.username || "—";

      const inc = {
        cadru: Number(r.cadru || 0),
        teava: Number(r.teava || 0),
        mecanism: Number(r.mecanism || 0),
        fixare: Number(r.fixare || 0),
      };
      const sum = inc.cadru + inc.teava + inc.mecanism + inc.fixare;

      // familii
      const fp = famMap.get(famName) || { family: famName, cadru: 0, teava: 0, mecanism: 0, fixare: 0, total: 0 };
      fp.cadru += inc.cadru; fp.teava += inc.teava; fp.mecanism += inc.mecanism; fp.fixare += inc.fixare; fp.total += sum;
      famMap.set(famName, fp);

      // useri (cine a introdus)
      const up = userMap.get(uname) || { username: uname, cadru: 0, teava: 0, mecanism: 0, fixare: 0, total: 0 };
      up.cadru += inc.cadru; up.teava += inc.teava; up.mecanism += inc.mecanism; up.fixare += inc.fixare; up.total += sum;
      userMap.set(uname, up);
    }

    const families = Array.from(famMap.values())
      .sort((a, b) => b.total - a.total);

    const topUsers = Array.from(userMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 50);

    res.json({
      period: {
        periodAll,
        year: periodAll ? null : year,
        week: periodAll ? null : week,
        start: periodAll ? null : start.toISOString(),
        end: periodAll ? null : end.toISOString(),
      },
      families,
      topUsers,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
