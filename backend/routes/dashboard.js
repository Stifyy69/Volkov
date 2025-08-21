// backend/routes/dashboard.js
import { Router } from "express";
import prisma from "../db.js";
import { auth } from "../utils.js";

const router = Router();

// GET /dashboard
router.get("/", auth(), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { taxEntries: true, drillJobs: true },
    });

    if (!user) return res.status(404).json({ error: "user inexistent" });

    const taxe = user.taxEntries.map((t) => ({
      id: t.id,
      tip: t.payment,
      amount: t.amount,
      cnp: t.cnp,
      createdAt: t.createdAt,
    }));

    const drill = user.drillJobs.map((d) => ({
      id: d.id,
      qty: d.processed,
      cnp: d.cnp,
      cost: d.processed * d.unitPrice,
      createdAt: d.createdAt,
    }));

    res.json({ taxe, drill });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
