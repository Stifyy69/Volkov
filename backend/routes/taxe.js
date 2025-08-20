import express from "express";
import { PrismaClient, TaxType, Currency } from "@prisma/client";

const prisma = new PrismaClient();
const router = express.Router();

function plusHours(h) {
  return new Date(Date.now() + h * 3600 * 1000);
}
function timeLeft(until) {
  const ms = until.getTime() - Date.now();
  const h = Math.max(0, Math.floor(ms / 3600000));
  const m = Math.max(0, Math.floor((ms % 3600000) / 60000));
  return `${h}h ${m}m`;
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "no token" });
  try {
    const jwt = await import("jsonwebtoken");
    const payload = jwt.default.verify(token, process.env.JWT_SECRET || "change-me");
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }
}

router.post("/taxe", auth, async (req, res) => {
  try {
    const { cnp, metoda, gratisFamilie } = req.body || {};
    if (!/^\d{1,6}$/.test(cnp || "")) return res.status(400).json({ error: "CNP invalid (max 6 cifre)" });
    if (!["curat", "murdar", "gratis"].includes(metoda)) return res.status(400).json({ error: "metodă invalidă" });

    const now = new Date();
    const existing = await prisma.taxEntry.findFirst({
      where: { type: TaxType.TAXA, cnp, validUntil: { gt: now } },
      orderBy: { createdAt: "desc" }
    });
    if (existing) return res.status(409).json({ error: "Există deja o taxă activă pe acest CNP." });

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
      if (!["Medelin Cartel", "818", "Stefanos Cartel"].includes(gratisFamilie))
        return res.status(400).json({ error: "familie invalidă pt. gratis" });
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
        familyId
      },
      include: { user: true, family: true }
    });

    try {
      const { sseBroadcast } = await import("../sse.js");
      sseBroadcast("taxe:new", { id: entry.id });
    } catch {}

    res.json({ ok: true, id: entry.id });
  } catch {
    res.status(500).json({ error: "eroare server" });
  }
});

router.get("/taxe", auth, async (_req, res) => {
  try {
    const now = new Date();
    const rows = await prisma.taxEntry.findMany({
      where: { type: TaxType.TAXA, validUntil: { gt: now } },
      include: { family: true, user: true },
      orderBy: { createdAt: "desc" }
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
      user: r.user?.username || ""
    }));
    res.json(out);
  } catch {
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
