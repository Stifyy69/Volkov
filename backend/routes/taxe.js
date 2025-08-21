import { Router } from "express";
import { PrismaClient, TaxType, Currency } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

const GRATIS_FAMILII = ["Medelin Cartel", "818", "Stefanos Cartel"];

// hh/mm remaining text
function timeLeft(until) {
  if (!until) return null;
  const ms = until.getTime() - Date.now();
  const h = Math.max(0, Math.floor(ms / 3600000));
  const m = Math.max(0, Math.floor((ms % 3600000) / 60000));
  return `${h}h ${m}m`;
}

/* -------------------------------- CREATE -------------------------------- */
// body: { cnp, metoda: 'curat'|'murdar'|'gratis', gratisFamilie? }
router.post("/", async (req, res) => {
  try {
    const { cnp, metoda, gratisFamilie } = req.body || {};
    if (!/^\d{1,6}$/.test(cnp || "")) {
      return res.status(400).json({ error: "CNP invalid (max 6 cifre)" });
    }
    if (!["curat", "murdar", "gratis"].includes(metoda)) {
      return res.status(400).json({ error: "metodă invalidă" });
    }

    // nu permitem dublură pe același CNP cât timp taxa e activă (4h)
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
      currency = Currency.CLEAN; amount = 40000;
    } else if (metoda === "murdar") {
      currency = Currency.DIRTY; amount = 60000;
    } else if (metoda === "gratis") {
      if (!GRATIS_FAMILII.includes(gratisFamilie))
        return res.status(400).json({ error: "familie invalidă pt. GRATIS" });
      const fam = await prisma.family.findUnique({ where: { name: gratisFamilie } });
      if (!fam) return res.status(400).json({ error: "familia nu există" });
      familyId = fam.id; currency = Currency.CLEAN; amount = 0;
    }

    const entry = await prisma.taxEntry.create({
      data: {
        type: TaxType.TAXA,
        currency,
        amount,
        validUntil: new Date(Date.now() + 4 * 3600 * 1000),
        cnp,
        userId: req.user?.id,           // dacă folosești middleware auth, va exista
        payment: metoda,                // 'curat'|'murdar'|'gratis'
        familyId,
      },
      include: { user: true, family: true },
    });

    res.json({
      ok: true,
      id: entry.id,
      cnp: entry.cnp,
      tip: entry.payment === "gratis"
        ? "GRATIS"
        : entry.currency === "CLEAN"
        ? "Bani curați"
        : "Bani murdari",
      amount: entry.amount,
      user: entry.user?.username || "",
      createdAt: entry.createdAt,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

/* ------------------------------ LIST ACTIVE ------------------------------ */
// GET /taxe         -> doar active (valabile încă 4h)
// GET /taxe?all=1   -> toate (istoric)
router.get("/", async (req, res) => {
  try {
    const isAll = String(req.query.all || "") === "1";
    const now = new Date();

    const where = isAll
      ? { type: TaxType.TAXA }
      : { type: TaxType.TAXA, validUntil: { gt: now } };

    const rows = await prisma.taxEntry.findMany({
      where,
      include: { family: true, user: true },
      orderBy: { createdAt: "desc" },
    });

    const out = rows.map((r) => {
      // fallback „legacy” pentru amount
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
        tip: r.payment === "gratis"
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

/* -------------------------------- DELETE -------------------------------- */
router.delete("/:id", async (req, res) => {
  try {
    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum)) return res.status(400).json({ error: "id invalid" });
    await prisma.taxEntry.delete({ where: { id: idNum } });
    res.json({ ok: true });
  } catch (e) {
    if (e?.code === "P2025") return res.status(404).json({ error: "nu există" });
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
