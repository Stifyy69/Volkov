import express from "express";
import prisma, { isoWeekRange } from "../db.js";
import { Currency, TaxType } from "@prisma/client";
import { auth } from "../utils.js";

const router = express.Router();

const FREE_FAMILIES = ["Medelin Cartel", "818", "Stefanos Cartel"];

function plusHours(h) {
  return new Date(Date.now() + h * 3600 * 1000);
}

function timeLeft(until) {
  const ms = until.getTime() - Date.now();
  const h = Math.max(0, Math.floor(ms / 3600000));
  const m = Math.max(0, Math.floor((ms % 3600000) / 60000));
  return `${h}h ${m}m`;
}

router.post("/", auth(), async (req, res) => {
  try {
    const { cnp, metoda, gratisFamilie } = req.body || {};
    if (!/^\d{1,6}$/.test(cnp || "")) return res.status(400).json({ error: "CNP invalid" });
    if (!["curat", "murdar", "gratis"].includes(metoda)) return res.status(400).json({ error: "metodă invalidă" });

    const now = new Date();
    const dup = await prisma.taxEntry.findFirst({
      where: { type: TaxType.TAXA, cnp, validUntil: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    if (dup) return res.status(409).json({ error: "Există deja o taxă activă pe acest CNP." });

    let currency = Currency.CLEAN;
    let amount = 0;
    let familyId = null;

    if (metoda === "curat") {
      currency = Currency.CLEAN;
      amount = 40000;
    } else if (metoda === "murdar") {
      currency = Currency.DIRTY;
      amount = 60000;
    } else {
      if (!FREE_FAMILIES.includes(gratisFamilie || "")) return res.status(400).json({ error: "familie invalidă pt. gratis" });
      const fam = await prisma.family.findUnique({ where: { name: gratisFamilie } });
      if (!fam) return res.status(400).json({ error: "familia nu există" });
      familyId = fam.id;
      currency = Currency.CLEAN;
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
      include: { user: true, family: true },
    });

    res.json({ ok: true, id: entry.id });
  } catch (e) {
    res.status(500).json({ error: "eroare server" });
  }
});

router.get("/", auth(), async (_req, res) => {
  try {
    const now = new Date();
    const rows = await prisma.taxEntry.findMany({
      where: { type: TaxType.TAXA, validUntil: { gt: now } },
      include: { family: true, user: true },
      orderBy: { createdAt: "desc" },
    });
    const out = rows.map((r) => ({
      id: r.id,
      cnp: r.cnp,
      tip: r.payment === "gratis" ? "GRATIS" : r.currency === "CLEAN" ? "Bani curați" : "Bani murdari",
      amount: r.payment === "gratis" ? 0 : r.currency === "CLEAN" ? 40000 : 60000,
      metoda: r.payment,
      gratisFamilie: r.family?.name || null,
      remaining: r.validUntil ? timeLeft(r.validUntil) : null,
      createdAt: r.createdAt,
      user: r.user?.username || "",
    }));
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: "eroare server" });
  }
});

router.get("/history", auth(), async (req, res) => {
  try {
    const periodAll = req.query.period === "all";
    const year = req.query.year ? Number(req.query.year) : null;
    const week = req.query.week ? Number(req.query.week) : null;

    let where = { type: TaxType.TAXA };
    if (!periodAll && year && week) {
      const { start, end } = isoWeekRange(year, week);
      where = { ...where, createdAt: { gte: start, lt: end } };
    }

    const list = await prisma.taxEntry.findMany({
      where,
      include: { family: true, user: true },
      orderBy: { createdAt: "desc" },
    });

    const out = list.map((t) => ({
      id: t.id,
      cnp: t.cnp,
      metoda: t.payment,
      tip: t.payment === "gratis" ? "GRATIS" : t.currency === "CLEAN" ? "Bani curați" : "Bani murdari",
      amount: t.payment === "gratis" ? 0 : t.currency === "CLEAN" ? 40000 : 60000,
      family: t.family?.name || null,
      user: t.user?.username || "",
      createdAt: t.createdAt,
      active: t.validUntil ? t.validUntil > new Date() : false,
    }));

    res.json(out);
  } catch (e) {
    res.status(500).json({ error: "eroare server" });
  }
});

router.delete("/:id", auth(), async (req, res) => {
  try {
    await prisma.taxEntry.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: "nu există" });
  }
});

export default router;
