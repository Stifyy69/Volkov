import { Router } from "express";
import { PrismaClient, Role, TaxType, Currency } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

function isoOf(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}
function inISOWeek(date, y, w) {
  const { year, week } = isoOf(date);
  return year === y && week === w;
}

/* -------------------------- STATS (Dashboard Admin) -------------------------- */
// GET /admin/stats?period=all  OR  /admin/stats?year=YYYY&week=WW
router.get("/stats", async (req, res) => {
  try {
    const periodAll = req.query.period === "all";
    const selYear = req.query.year ? Number(req.query.year) : null;
    const selWeek = req.query.week ? Number(req.query.week) : null;

    const users = await prisma.user.findMany({
      include: {
        taxEntries: true,
        drillJobs: true,
      },
    });

    const out = users.map((u) => {
      let clean = 0, dirty = 0;

      // taxe (TAXA) – ignorăm gratis
      for (const t of u.taxEntries) {
        if (t.type !== TaxType.TAXA) continue;
        if (!periodAll && selYear && selWeek && !inISOWeek(t.createdAt, selYear, selWeek)) continue;
        if (t.payment === "gratis") continue;
        if (t.currency === Currency.CLEAN) clean += 40000;
        else if (t.currency === Currency.DIRTY) dirty += 60000;
      }

      // burghiu – mereu DIRTY; gratis => unitPrice 0
      for (const d of u.drillJobs) {
        if (!periodAll && selYear && selWeek && !inISOWeek(d.createdAt, selYear, selWeek)) continue;
        dirty += (d.processed || 0) * (d.unitPrice || 0);
      }

      const total = clean + dirty;
      return {
        id: u.id,
        username: u.username,
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

/* -------------------------------- INVITES -------------------------------- */
// POST /admin/invites { role?: "OPERATOR"|"HEAD_OPERATOR"|"ADMIN"|"AUDIT" }
router.post("/invites", async (req, res) => {
  try {
    const role = ["OPERATOR","HEAD_OPERATOR","ADMIN","AUDIT"].includes(req.body?.role)
      ? req.body.role : "OPERATOR";
    const code = Math.random().toString(36).slice(2, 10).toUpperCase();
    const inv = await prisma.invite.create({
      data: { code, role, createdById: req.user?.id || null },
    });
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

// GET /admin/invites (opțional, pentru listare)
router.get("/invites", async (_req, res) => {
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
