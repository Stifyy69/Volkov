import express from "express";
import { PrismaClient, TaxType, Currency } from "@prisma/client";

const prisma = new PrismaClient();
const router = express.Router();

// POST /taxe - adaugă taxă
router.post("/", async (req, res) => {
  try {
    const { cnp, metoda, family } = req.body || {};
    if (!cnp || !/^\d{1,6}$/.test(cnp))
      return res.status(400).json({ error: "CNP invalid" });

    let currency = Currency.CLEAN;
    let amount = 0;

    if (metoda === "curat") {
      currency = Currency.CLEAN;
      amount = 40000;
    } else if (metoda === "murdar") {
      currency = Currency.DIRTY;
      amount = 60000;
    } else if (metoda === "gratis") {
      amount = 0;
    } else {
      return res.status(400).json({ error: "Metodă invalidă" });
    }

    const entry = await prisma.taxEntry.create({
      data: {
        type: TaxType.TAXA,
        cnp,
        currency,
        amount,
        payment: metoda,
        familyId: family || null,
        userId: req.user?.id || null,
      },
      include: { user: true, family: true },
    });

    res.json(entry);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Eroare server la taxă" });
  }
});

// GET /taxe - listă taxe
router.get("/", async (_req, res) => {
  try {
    const taxes = await prisma.taxEntry.findMany({
      where: { type: TaxType.TAXA },
      include: { user: true, family: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(taxes);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Eroare server la listă taxe" });
  }
});

export default router;
