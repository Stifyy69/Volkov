// backend/routes/stats-taxe.js
import { Router } from "express";
import prisma from "../db.js";
import { auth } from "../utils.js";

const router = Router();

/**
 * GET /stats/taxe
 * Returnează ultimele taxe active
 */
router.get("/", auth(), async (_req, res) => {
  try {
    const now = new Date();
    const taxes = await prisma.taxEntry.findMany({
      where: { validUntil: { gt: now } },
      include: { user: true, family: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const out = taxes.map((t) => ({
      id: t.id,
      cnp: t.cnp,
      familie: t.family?.name,
      tip: t.payment,
      amount: t.amount,
      user: t.user?.username,
      remaining: t.validUntil ? `${Math.max(0, Math.floor((t.validUntil - Date.now()) / 60000))} min` : null,
    }));

    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
