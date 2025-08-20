import express from "express";
import prisma, { isoWeekRange } from "../db.js";
import { auth } from "../utils.js";
import { CashType, TaxType, Currency } from "@prisma/client";

const router = express.Router();

const GRATIS_FAMILII = ["Medelin Cartel", "818", "Stefanos Cartel"];

function inWeek(periodAll, year, week, d) {
  if (periodAll || !year || !week) return true;
  const { start, end } = isoWeekRange(year, week);
  return d >= start && d < end;
}

/* ------------------------------- CREATE JOB --------------------------------
   body: { cnp, part: 'cadru'|'teava'|'mecanism'|'fixare', family, quantity } */
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

    const isGratisFamily = GRATIS_FAMILII.includes(family);
    const unitPrice = isGratisFamily ? 0 : 1000; // bani murdari

    const fam =
      family ? await prisma.family.findUnique({ where: { name: family } }) : null;

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

    // log în TaxEntry pentru contabilitate
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

/* ------------------------------ LISTĂ RECENTĂ ------------------------------ */
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
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

/* --------------------------------- LISTĂ ALL -------------------------------
   /drill/all?period=all | week&year=YYYY&week=WW
   + opționale: user, cnp, family (pentru Tabele All) */
router.get("/all", auth(), async (req, res) => {
  try {
    const periodAll = req.query.period === "all";
    const year = req.query.year ? Number(req.query.year) : null;
    const week = req.query.week ? Number(req.query.week) : null;

    const qUser = (req.query.user || "").toString().trim().toLowerCase();
    const qCnp = (req.query.cnp || "").toString().trim();
    const qFam = (req.query.family || "").toString().trim().toLowerCase();

    const list = await prisma.drillJob.findMany({
      include: { family: true, user: true },
      orderBy: { createdAt: "desc" },
    });

    const filtered = list.filter((j) => {
      if (!inWeek(periodAll, year, week, j.createdAt)) return false;
      if (qUser && !(j.user?.username || "").toLowerCase().includes(qUser)) return false;
      if (qCnp && !(j.cnp || "").includes(qCnp)) return false;
      if (qFam && !(j.family?.name || "").toLowerCase().includes(qFam)) return false;
      return true;
    });

    res.json(
      filtered.map((j) => ({
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
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

/* ---------------------------------- DELETE --------------------------------- */
router.delete("/:id", auth(), async (req, res) => {
  try {
    await prisma.drillJob.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    if (e?.code === "P2025") return res.status(404).json({ error: "nu există" });
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
