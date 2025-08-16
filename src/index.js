import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import {
  PrismaClient,
  Role,
  TaxType,
  Currency,
  Material,
  CashType,
} from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const prisma = new PrismaClient();

const PORT = process.env.PORT || 8081;
const HOST = "0.0.0.0";
const JWT_SECRET = process.env.JWT_SECRET || "change-me";
const FRONT_ORIGIN = process.env.FRONT_ORIGIN || "*";

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", FRONT_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// servește frontend-ul
app.use(express.static(path.join(__dirname, "../public")));
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "../public/index.html"))
);

// ================= UTILS =================
function plusHours(h) {
  return new Date(Date.now() + h * 3600 * 1000);
}
function timeLeft(until) {
  const ms = until.getTime() - Date.now();
  if (ms <= 0) return "expirat";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

// ================= AUTH =================
function auth(required = true) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token)
      return required ? res.status(401).json({ error: "no token" }) : next();
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      return res.status(401).json({ error: "invalid token" });
    }
  };
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role))
      return res.status(403).json({ error: "forbidden" });
    next();
  };
}

// ================= REGISTER / LOGIN =================
app.post("/auth/register", async (req, res) => {
  try {
    const { username, password, nickname, cnp, inviteCode } = req.body;
    if (!username || !password || !inviteCode)
      return res.status(400).json({ error: "date lipsă" });

    const invite = await prisma.invite.findUnique({ where: { code: inviteCode } });
    if (!invite || invite.usedAt)
      return res.status(400).json({ error: "invitație invalidă/folosită" });

    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) return res.status(400).json({ error: "username ocupat" });

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        password: hash,
        nickname: nickname || username,
        cnp: cnp || null,
        role: invite.role,
      },
    });

    await prisma.invite.update({
      where: { id: invite.id },
      data: { usedAt: new Date(), usedById: user.id },
    });

    const token = jwt.sign(
      { id: user.id, role: user.role, username: user.username },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token, role: user.role, username: user.username });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return res.status(400).json({ error: "invalid" });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: "invalid" });
  const token = jwt.sign(
    { id: user.id, role: user.role, username: user.username },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
  res.json({ token, role: user.role, username: user.username });
});

// ================= TAXE =================
app.post("/taxe", auth(), async (req, res) => {
  try {
    const { cnp, metoda, gratisFamilie } = req.body;

    // interzicem duplicate active
    const active = await prisma.taxEntry.findFirst({
      where: { cnp, type: TaxType.TAXA, validUntil: { gt: new Date() } },
    });
    if (active) return res.status(409).json({ error: "Taxă activă deja" });

    let data = {
      cnp,
      type: TaxType.TAXA,
      userId: req.user.id,
      validUntil: plusHours(4),
    };

    if (metoda === "curat") {
      data.currency = Currency.CLEAN;
      data.amount = 40000;
    } else if (metoda === "murdar") {
      data.currency = Currency.DIRTY;
      data.amount = 60000;
    } else if (metoda === "otel") {
      data.currency = Currency.MATERIAL;
      data.material = Material.OTEL;
      data.amount = 15;
    } else if (metoda === "praf") {
      data.currency = Currency.MATERIAL;
      data.material = Material.PRAF;
      data.amount = 25;
    } else if (metoda === "gratis") {
      const fam = await prisma.family.findUnique({ where: { name: gratisFamilie } });
      if (!fam) return res.status(400).json({ error: "familie invalidă" });
      data.amount = 0;
      data.familyId = fam.id;
    }

    const entry = await prisma.taxEntry.create({ data });
    res.json(entry);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

app.get("/taxe", auth(), async (req, res) => {
  const list = await prisma.taxEntry.findMany({
    where: { type: TaxType.TAXA, validUntil: { gt: new Date() } },
    include: { family: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    list.map((t) => ({
      id: t.id,
      cnp: t.cnp,
      tip:
        t.currency === "CLEAN"
          ? "Bani curați"
          : t.currency === "DIRTY"
          ? "Bani murdari"
          : t.material === "OTEL"
          ? "Oțel"
          : "Praf de pușcă",
      amount: t.amount,
      familie: t.family?.name || null,
      remaining: t.validUntil ? timeLeft(t.validUntil) : null,
    }))
  );
});

// ================= BURGHIU =================
app.post("/drill", auth(), async (req, res) => {
  try {
    const { cnp, part, family, quantity, cashType } = req.body;
    const fam = family
      ? await prisma.family.findUnique({ where: { name: family } })
      : null;
    const isDirty = cashType === "DIRTY";
    const unitPrice = isDirty ? 1000 : 650;

    let data = {
      cnp,
      processed: quantity,
      cadru: part === "cadru" ? quantity : 0,
      teava: part === "teava" ? quantity : 0,
      mecanism: part === "mecanism" ? quantity : 0,
      fixare: part === "fixare" ? quantity : 0,
      cashType: isDirty ? CashType.DIRTY : CashType.CLEAN,
      unitPrice,
      userId: req.user.id,
      familyId: fam?.id || null,
    };

    const job = await prisma.drillJob.create({ data });
    res.json(job);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

app.get("/drill", auth(), async
