// backend/routes/taxe.js
import { Router } from "express";
import prisma from "../db.js";
import { auth } from "../utils.js";
import { TaxType, Currency } from "@prisma/client";

const router = Router();

// POST /taxe
router.post("/", auth(), async (req, res) => {
  try {
    const { cnp, metoda, gratisFamilie } = req.body || {};
    if (!/^\d{1,6}$/.test(cnp || ""))
      return res.status(400).json({ error: "CNP invalid (max 6 cifre)" });
    if (!["curat", "murdar", "gratis"].includes(metoda))
      return res.status(400).json({ error: "metodă invalidă" });

    const now = new Date();
    const existing = await prisma.taxEntry.findFirst({
      where: { type: TaxType.TAXA, cnp, validUntil: { gt: now } },
    });
    if (existing)
      return res.status(409).json({ error: "Există deja taxă activă pe acest CNP." });

    let currency = Currency.CLEAN;
    let amount = 0;
    let familyId = null;

    if (metoda === "curat") {
      currency = Currency.CLEAN;
      amount = 40000;
    } else if (metoda === "murdar") {
      currency = Currency.DIRTY;
      amount = 60000;
    } else if (metoda === "gratis") {
      const fam = await prisma.family.findUnique({ where: { name: gratisFamilie } });
      if (!fam) return res.status(400).json({ error: "familia nu există" });
      familyId = fam.id;
    }

    const entry = await prisma.taxEntry.create({
      data: {
        type: TaxType.TAXA,
        currency,
        amount,
        validUntil: new Date(Date.now() + 4 * 3600 * 1000),
        cnp,
        userId: req.user.id,
        payment: metoda,
        familyId,
      },
    });

    res.json({ ok: true, id: entry.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

// GET /taxe
router.get("/", auth(), async (_req, res) => {
  try {
    const now = new Date();
    const rows = await prisma.taxEntry.findMany({
      where: { type: TaxType.TAXA, validUntil: { gt: now } },
      include: { family: true, user: true },
      orderBy: { createdAt: "desc" },
    });

    res.json(rows.map((r) => ({
      id: r.id,
      cnp: r.cnp,
      tip: r.payment,
      familie: r.family?.name || null,
      user: r.user?.username || "",
      amount: r.amount,
      createdAt: r.createdAt,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
