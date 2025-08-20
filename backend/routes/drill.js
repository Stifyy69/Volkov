// backend/routes/drill.js
import express from "express";
import prisma from "../db.js";
import { CashType, TaxType, Currency } from "@prisma/client";
import { auth } from "../utils.js";

const router = express.Router();

// creare job burghiu
router.post("/", auth(), async (req, res) => {
  try {
    const { cnp, part, family, quantity } = req.body || {};
    if (!/^\d{1,6}$/.test(cnp || ""))
      return res.status(400).json({ error: "CNP invalid" });
    if (!["cadru", "teava", "mecanism", "fixare"].includes(part))
      return res.status(400).json({ error: "piesă invalidă" });

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0)
      return res.status(400).json({ error: "cantitate invalidă" });

    const isGratisFamily = ["Medelin Cartel", "818", "Stefanos Cartel"].includes(family);
    const unitPrice = isGratisFamily ? 0 : 1000;

    const fam = family ? await prisma.family.findUnique({ where: { name: family } }) : null;

    const data = {
      cnp,
      processed: qty,
      cadru: 0,
      mecanism: 0,
      teava: 0,
      fixare: 0,
      cashType: CashType.DIRTY,
      unitPrice,
      userId: req.user.id,
      familyId: fam?.id || null,
    };
    if (part === "cadru") data.cadru = qty;
    if (part === "mecanism") data.mecanism = qty;
    if (part === "teava") data.teava = qty;
    if (part === "fixare") data.fixare = qty;

    const job = await prisma.drillJob.create({
      data,
      include: { family: true, user: true },
    });

    // tracking și în taxEntries
    await prisma.taxEntry.create({
      data: {
        type: TaxType.BURGHIU,
        currency: Currency.DIRTY,
        amount: qty * unitPrice,
        cnp,
        userId: req.user.id,
        familyId: fam?.id || null,
        payment: isGratisFamily ? "GRATIS" : "Bani murdari",
      },
    });

    res.json({ ok: true, id: job.id, cost: qty * unitPrice });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

// listare burghiu recente
router.get("/", auth(), async (_req, res) => {
  try {
    const list = await prisma.drillJob.findMany({
      include: { family: true, user: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(
      list.map((j) => ({
        id: j.id,
        cnp: j.cnp,
        cadru: j.cadru,
        mecanism: j.mecanism,
        teava: j.teava,
        fixare: j.fixare,
        qty: j.processed,
        metodaPlata: j.unitPrice === 0 ? "GRATIS" : "Bani murdari",
        costTotal: j.processed * j.unitPrice,
        family: j.family?.name || null,
        user: j.user?.username || "",
        createdAt: j.createdAt,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: "eroare server" });
  }
});

// listare ALL pentru admin
router.get("/all", auth(), async (_req, res) => {
  try {
    const list = await prisma.drillJob.findMany({
      include: { family: true, user: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(
      list.map((j) => ({
        id: j.id,
        cnp: j.cnp,
        cadru: j.cadru,
        mecanism: j.mecanism,
        teava: j.teava,
        fixare: j.fixare,
        qty: j.processed,
        metodaPlata: j.unitPrice === 0 ? "GRATIS" : "Bani murdari",
        costTotal: j.processed * j.unitPrice,
        family: j.family?.name || null,
        user: j.user?.username || "",
        createdAt: j.createdAt,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: "eroare server" });
  }
});

// ștergere job
router.delete("/:id", auth(), async (req, res) => {
  try {
    await prisma.drillJob.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
