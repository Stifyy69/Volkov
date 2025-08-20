import express from "express";
import prisma from "../db.js";
import { Role } from "@prisma/client";
import { auth, requireRole, parsePeriodQuery } from "../utils.js";

const router = express.Router();

/* GET /tables/list
   Query:
     - type=taxe | drill
     - period=all sau year & week
     - filterUser=...
     - filterCnp=...
     - filterFamily=...
*/
router.get("/list", auth(), requireRole(Role.ADMIN), async (req, res) => {
  try {
    const { periodAll, start, end, year, week } = parsePeriodQuery(req.query);
    const { type, filterUser, filterCnp, filterFamily } = req.query;

    const where = {};

    if (!periodAll) {
      where.createdAt = { gte: start, lt: end };
    }
    if (filterUser) {
      where.user = { username: { contains: filterUser, mode: "insensitive" } };
    }
    if (filterCnp) {
      where.cnp = { contains: filterCnp };
    }

    if (type === "taxe") {
      const rows = await prisma.taxa.findMany({
        where,
        include: { user: { select: { username: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      res.json({ rows, type: "taxe" });
    } else if (type === "drill") {
      if (filterFamily) {
        where.family = { name: { contains: filterFamily, mode: "insensitive" } };
      }
      const rows = await prisma.drillJob.findMany({
        where,
        include: {
          user: { select: { username: true } },
          family: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      res.json({ rows, type: "drill" });
    } else {
      res.status(400).json({ error: "tip invalid" });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

/* DELETE /tables/delete/:type/:id
   - type=taxe|drill
   - id numeric
   -> ștergere sigură (dacă nu există, returnează 200 cu {deleted:false})
*/
router.delete("/delete/:type/:id", auth(), requireRole(Role.ADMIN), async (req, res) => {
  try {
    const { type, id } = req.params;
    const idNum = Number(id);
    if (isNaN(idNum)) return res.status(400).json({ error: "id invalid" });

    let deleted = false;

    if (type === "taxe") {
      const found = await prisma.taxa.findUnique({ where: { id: idNum } });
      if (found) {
        await prisma.taxa.delete({ where: { id: idNum } });
        deleted = true;
      }
    } else if (type === "drill") {
      const found = await prisma.drillJob.findUnique({ where: { id: idNum } });
      if (found) {
        await prisma.drillJob.delete({ where: { id: idNum } });
        deleted = true;
      }
    } else {
      return res.status(400).json({ error: "tip invalid" });
    }

    res.json({ deleted });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
