import express from "express";
import prisma, { isoWeekRange } from "../db.js";
import { auth } from "../utils.js";
import { TaxType, Currency } from "@prisma/client";

const router = express.Router();

const GRATIS_FAMILII = ["Medelin Cartel", "818", "Stefanos Cartel"];

// hh/mm remaining text
function timeLeft(until) {
  if (!until) return null;
  const ms = until.getTime() - Date.now();
  const h = Math.max(0, Math.floor(ms / 3600000));
  const m = Math.max(0, Math.floor((ms % 3600000) / 60000));
  return `${h}h ${m}m`;
}

function inWeek(periodAll, year, week, d) {
  if (periodAll || !year || !week) return true;
  const { start, end } = isoWeekRange(year, week);
  return d >= start && d < end;
}

/* ------------------------------- CREATE TAXĂ ------------------------------- */
// body: { cnp, metoda: 'curat'|'murdar'|'gratis', gratisFamilie? }
router.post("/", auth(), async (req, res) => {
  try {
    const { cnp, metoda, gratisFamilie } = req.body || {};

    if (!/^\d{1,6}$/.test(cnp || ""))
      return res.status(400).json({ error: "CNP invalid (max 6 cifre)" });

    if (!["curat", "murdar", "gratis"].includes(metoda))
      return res.status(400).json({ error: "metodă invalidă" });

    // Nu permitem dublură pe același CNP cât timp taxa e activă (4h)
    const now = new Date();
    const existing = await prisma.taxEntry.findFirst({
      where: { type: TaxType.TAXA, cnp, validUntil: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return res.status(409).json({ error: "Există deja o taxă activă pe acest CNP." });
    }

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
      if (!GRATIS_FAMILII.includes(gratisFamilie))
        return res.status(400).json({ error: "familie invalidă pt. GRATIS" });
      const fam = await prisma.family.findUnique({ where: { name: gratisFamilie } });
      if (!fam) return res.status(400).json({ error: "familia nu există" });
      familyId = fam.id;
      currency = Currency.CLEAN; // neimportant la 0, păstrăm CLEAN pentru consecvență
      amount = 0;
    }

    const entry = await prisma.taxEntry.create({
      data: {
        type: TaxType.TAXA,
        currency,
        amount,
        validUntil: new Date(Date.now() + 4 * 3600 * 1000),
        cnp,
        userId: req.user.id,
        payment: metoda, // 'curat' | 'murdar' | 'gratis'
        familyId,
      },
      include: { user: true, family: true },
    });

    res.json({
      ok: true,
      id: entry.id,
      cnp: entry.cnp,
      tip:
        entry.payment === "gratis"
          ? "GRATIS"
          : entry.currency === "CLEAN"
          ? "Bani curați"
          : "Bani murdari",
      amount: entry.amount,
      user: entry.user?.username || "",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

/* ------------------------------- LISTĂ LIVE --------------------------------
   Taxe active (valabile încă 4h) pentru pagina „Taxe Active” */
router.get("/", auth(), async (_req, res) => {
  try {
    const now = new Date();
    const rows = await prisma.taxEntry.findMany({
      where: { type: TaxType.TAXA, validUntil: { gt: now } },
      include: { family: true, user: true },
      orderBy: { createdAt: "desc" },
    });

    const out = rows.map((r) => {
      // fallback pentru amount, dacă lipsesc valorile „legacy”
      const amount =
        typeof r.amount === "number" && r.amount >= 0
          ? r.amount
          : r.payment === "gratis"
          ? 0
          : r.currency === "CLEAN"
          ? 40000
          : 60000;

      return {
        id: r.id,
        cnp: r.cnp,
        tip:
          r.payment === "gratis"
            ? "GRATIS"
            : r.currency === "CLEAN"
            ? "Bani curați"
            : "Bani murdari",
        amount,
        metoda: r.payment,
        gratisFamilie: r.family?.name || null,
        remaining: r.validUntil ? timeLeft(r.validUntil) : null,
        createdAt: r.createdAt,
        user: r.user?.username || "",
      };
    });

    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

/* ------------------------------- LISTĂ ALL ---------------------------------
   /taxe/all?period=all | week&year=YYYY&week=WW
   + opționale: user, cnp, family (pentru Tabele All) */
router.get("/all", auth(), async (req, res) => {
  try {
    const periodAll = req.query.period === "all";
    const year = req.query.year ? Number(req.query.year) : null;
    const week = req.query.week ? Number(req.query.week) : null;

    const qUser = (req.query.user || "").toString().trim().toLowerCase();
    const qCnp = (req.query.cnp || "").toString().trim();
    const qFam = (req.query.family || "").toString().trim().toLowerCase();

    const rows = await prisma.taxEntry.findMany({
      where: { type: TaxType.TAXA },
      include: { family: true, user: true },
      orderBy: { createdAt: "desc" },
    });

    const filtered = rows.filter((r) => {
      if (!inWeek(periodAll, year, week, r.createdAt)) return false;
      if (qUser && !(r.user?.username || "").toLowerCase().includes(qUser)) return false;
      if (qCnp && !(r.cnp || "").includes(qCnp)) return false;
      if (qFam && !(r.family?.name || "").toLowerCase().includes(qFam)) return false;
      return true;
    });

    const out = filtered.map((r) => {
      const amount =
        typeof r.amount === "number" && r.amount >= 0
          ? r.amount
          : r.payment === "gratis"
          ? 0
          : r.currency === "CLEAN"
          ? 40000
          : 60000;

      return {
        id: r.id,
        cnp: r.cnp,
        metoda: r.payment, // 'curat' | 'murdar' | 'gratis'
        tip:
          r.payment === "gratis"
            ? "GRATIS"
            : r.currency === "CLEAN"
            ? "Bani curați"
            : "Bani murdari",
        amount,
        family: r.family?.name || null,
        user: r.user?.username || "",
        createdAt: r.createdAt,
      };
    });

    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

/* -------------------------------- DELETE ---------------------------------- */
router.delete("/:id", auth(), async (req, res) => {
  try {
    await prisma.taxEntry.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    // dacă nu există, întoarcem 404 să nu pice UI-ul
    if (e?.code === "P2025") return res.status(404).json({ error: "nu există" });
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
