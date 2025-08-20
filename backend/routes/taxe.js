// backend/routes/taxe.js
import express from "express";
import prisma from "../db.js";
import { TaxType, Currency } from "@prisma/client";
import { plusHours, timeLeft, auth } from "../utils.js";

const router = express.Router();

// adăugare taxă
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
      return res.status(409).json({ error: "Există deja o taxă activă pe acest CNP." });

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
      amount = 0;
    }

    const entry = await prisma.taxEntry.create({
      data: {
        type: TaxType.TAXA,
        currency,
        amount,
        validUntil: plusHours(4),
        cnp,
        userId: req.user.id,
        payment: metoda,
        familyId,
      },
      include: { family: true, user: true },
    });

    res.json({
      id: entry.id,
      cnp: entry.cnp,
      tip:
        entry.payment === "gratis"
          ? "GRATIS"
          : entry.currency === "CLEAN"
          ? "Bani curați"
          : "Bani murdari",
      amount: entry.amount,
      gratisFamilie: entry.family?.name || null,
      remaining: timeLeft(entry.validUntil),
      user: entry.user?.username,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

// listare taxe active
router.get("/", auth(), async (_req, res) => {
  try {
    const now = new Date();
    const list = await prisma.taxEntry.findMany({
      where: { type: TaxType.TAXA, validUntil: { gt: now } },
      include: { family: true, user: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(
      list.map((r) => ({
        id: r.id,
        cnp: r.cnp,
        tip:
          r.payment === "gratis"
            ? "GRATIS"
            : r.currency === "CLEAN"
            ? "Bani curați"
            : "Bani murdari",
        amount: r.amount,
        gratisFamilie: r.family?.name || null,
        remaining: timeLeft(r.validUntil),
        user: r.user?.username,
        createdAt: r.createdAt,
      }))
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

// listare taxe ALL pentru admin / statistici
router.get("/all", auth(), async (_req, res) => {
  try {
    const list = await prisma.taxEntry.findMany({
      where: { type: TaxType.TAXA },
      include: { family: true, user: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(
      list.map((r) => ({
        id: r.id,
        cnp: r.cnp,
        tip:
          r.payment === "gratis"
            ? "GRATIS"
            : r.currency === "CLEAN"
            ? "Bani curați"
            : "Bani murdari",
        amount: r.amount,
        gratisFamilie: r.family?.name || null,
        user: r.user?.username,
        createdAt: r.createdAt,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: "eroare server" });
  }
});

// ștergere taxă
router.delete("/:id", auth(), async (req, res) => {
  try {
    await prisma.taxEntry.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
