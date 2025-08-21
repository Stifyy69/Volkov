import { Router } from "express";
import { PrismaClient, CashType, TaxType, Currency } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

// GRATIS pentru aceste familii
const GRATIS_FAMILII = ["Medelin Cartel", "818", "Stefanos Cartel"];

/* -------------------------------- CREATE -------------------------------- */
// body: { cnp, part: 'cadru'|'teava'|'mecanism'|'fixare', family, quantity }
router.post("/", async (req, res) => {
  try {
    const { cnp, part, family, quantity } = req.body || {};
    if (!/^\d{1,6}$/.test(cnp || "")) return res.status(400).json({ error: "CNP invalid" });
    if (!["cadru", "teava", "mecanism", "fixare"].includes(part)) return res.status(400).json({ error: "piesă invalidă" });

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: "cantitate invalidă" });

    const isGratisFamily = GRATIS_FAMILII.includes(family);
    const unitPrice = isGratisFamily ? 0 : 1000; // bani murdari

    const fam = family ? await prisma.family.findUnique({ where: { name: family } }) : null;
    const famId = fam ? fam.id : null;

    const data = {
      cnp,
      processed: qty,
      cadru: 0, mecanism: 0, teava: 0, fixare: 0,
      cashType: CashType.DIRTY,
      unitPrice,
      userId: req.user?.id,
      familyId: famId,
    };
    if (part === "cadru") data.cadru = qty;
    if (part === "mecanism") data.mecanism = qty;
    if (part === "teava") data.teava = qty;
    if (part === "fixare") data.fixare = qty;

    const job = await prisma.drillJob.create({
      data,
      include: { user: true, family: true }
    });

    // tracking valoare murdară în taxEntries (tip BURGHIU)
    await prisma.taxEntry.create({
      data: {
        type: TaxType.BURGHIU,
        currency: Currency.DIRTY,
        amount: qty * unitPrice,
        cnp,
        userId: req.user?.id,
        familyId: famId,
        payment: isGratisFamily ? "GRATIS" : "Bani murdari",
      },
    });

    res.json({ ok: true, id: job.id, cost: qty * unitPrice });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

/* -------------------------------- LIST --------------------------------- */
// GET /drill -> ultimele joburi (toate; frontend filtrează/slice(0,5))
router.get("/", async (_req, res) => {
  try {
    const list = await prisma.drillJob.findMany({
      include: { family: true, user: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(list.map((j) => ({
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
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

/* ------------------------------- DELETE -------------------------------- */
router.delete("/:id", async (req, res) => {
  try {
    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum)) return res.status(400).json({ error: "id invalid" });
    await prisma.drillJob.delete({ where: { id: idNum } });
    res.json({ ok: true });
  } catch (e) {
    if (e?.code === "P2025") return res.status(404).json({ error: "nu există" });
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
