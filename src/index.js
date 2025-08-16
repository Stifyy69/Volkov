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

// Servește frontend-ul
app.use(express.static(path.join(__dirname, "../public")));
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "../public/index.html"))
);

const FAMILIES = [
  { name: "Medelin Cartel", colorHex: "#ff7bac" },
  { name: "818", colorHex: "#cccccc" },
  { name: "Stefanos Cartel", colorHex: "#40e0d0" },
  { name: "Bogota Thugs", colorHex: "#ffd700" },
  { name: "LowLine", colorHex: "#001f3f" },
  { name: "Casa Blanca", colorHex: "#87cefa" },
  { name: "LaPuentes", colorHex: "#8b5cf6" },
  { name: "Mali Strip", colorHex: "#8B6E4E" },
  { name: "Garda Veche", colorHex: "#808080" },
  { name: "NDR", colorHex: "#8b0000" },
  { name: "Velvet", colorHex: "#2ecc71" },
  { name: "Santos Gruppo", colorHex: "#ffffff" },
  { name: "Mayans MC", colorHex: "#000000" },
  { name: "La CosaNostra", colorHex: "#ffa500" },
  { name: "Hells Riders", colorHex: "#ff6666" },
  { name: "BACM", colorHex: "#d4af37" },
];

function plusHours(h) {
  return new Date(Date.now() + h * 3600 * 1000);
}
function timeLeft(until) {
  const ms = until.getTime() - Date.now();
  const h = Math.max(0, Math.floor(ms / 3600000));
  const m = Math.max(0, Math.floor((ms % 3600000) / 60000));
  return `${h}h ${m}m`;
}

async function ensureFamilies() {
  for (const f of FAMILIES) {
    await prisma.family.upsert({
      where: { name: f.name },
      create: f,
      update: { colorHex: f.colorHex },
    });
  }
}

async function bootstrapAdminInvite() {
  const code = process.env.ADMIN_INVITE_CODE;
  if (!code) return;
  const users = await prisma.user.count();
  const exists = await prisma.invite.findUnique({ where: { code } });
  if (users === 0 && !exists) {
    await prisma.invite.create({ data: { code, role: Role.ADMIN } });
    console.log("Admin invite pregătit:", code);
  }
}

function auth(required = true) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return required ? res.status(401).json({ error: "no token" }) : next();
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = payload;
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

app.get("/health", (_req, res) => res.json({ ok: true }));

// ========= AUTH =========
app.post("/auth/register", async (req, res) => {
  try {
    const { username, password, nickname, cnp, inviteCode, email } = req.body || {};
    if (!username || !password || !inviteCode)
      return res.status(400).json({ error: "date lipsă" });
    if (cnp && !/^\d{1,6}$/.test(cnp))
      return res.status(400).json({ error: "CNP invalid (max 6 cifre)" });

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
        email: email || null,
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
  } catch {
    res.status(500).json({ error: "eroare server" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(400).json({ error: "credentiale invalide" });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "credentiale invalide" });
    const token = jwt.sign(
      { id: user.id, role: user.role, username: user.username },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token, role: user.role, username: user.username });
  } catch {
    res.status(500).json({ error: "eroare server" });
  }
});

app.get("/auth/me", auth(), async (req, res) => {
  const me = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, username: true, role: true, nickname: true },
  });
  res.json(me);
});

// ========= INVITES =========
app.post(
  "/invites",
  auth(),
  requireRole(Role.ADMIN, Role.HEAD_OPERATOR),
  async (req, res) => {
    const { role } = req.body || {};
    const r = role && Object.values(Role).includes(role) ? role : Role.OPERATOR;
    const code = Math.random().toString(36).slice(2, 10).toUpperCase();
    const inv = await prisma.invite.create({
      data: { code, role: r, createdById: req.user.id },
    });
    res.json({
      code: inv.code,
      role: inv.role,
      link: `${req.headers.origin || ""}/?invite=${inv.code}`,
    });
  }
);

app.get(
  "/invites",
  auth(),
  requireRole(Role.ADMIN, Role.HEAD_OPERATOR),
  async (_req, res) => {
    const list = await prisma.invite.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(list);
  }
);

// ========= TAXE =========
// metoda: 'curat' | 'murdar' | 'otel' | 'praf' | 'gratis'
// NU acceptăm taxă dublă pe același CNP cât timp există una activă (4h)
app.post("/taxe", auth(), async (req, res) => {
  try {
    const { cnp, metoda, gratisFamilie } = req.body || {};
    if (!/^\d{1,6}$/.test(cnp || ""))
      return res.status(400).json({ error: "CNP invalid (max 6 cifre)" });
    if (!["curat", "murdar", "otel", "praf", "gratis"].includes(metoda))
      return res.status(400).json({ error: "metodă invalidă" });

    // verificare dubluri active (4h)
    const now = new Date();
    const existing = await prisma.taxEntry.findFirst({
      where: { type: TaxType.TAXA, cnp, validUntil: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return res
        .status(409)
        .json({ error: "Există deja o taxă activă pe acest CNP." });
    }

    let currency = Currency.CLEAN;
    let material = null;
    let amount = 0;
    let familyId = null;

    if (metoda === "curat") {
      currency = Currency.CLEAN;
      amount = 40000;
    }
    if (metoda === "murdar") {
      currency = Currency.DIRTY;
      amount = 60000;
    }
    if (metoda === "otel") {
      currency = Currency.MATERIAL;
      material = Material.OTEL;
      amount = 15;
    }
    if (metoda === "praf") {
      currency = Currency.MATERIAL;
      material = Material.PRAF;
      amount = 25;
    }
    if (metoda === "gratis") {
      if (!["Medelin Cartel", "818", "Stefanos Cartel"].includes(gratisFamilie))
        return res.status(400).json({ error: "familie invalidă pt. gratis" });
      const fam = await prisma.family.findUnique({
        where: { name: gratisFamilie },
      });
      if (!fam) return res.status(400).json({ error: "familia nu există" });
      familyId = fam.id;
      currency = Currency.CLEAN;
      material = null;
      amount = 0;
    }

    const entry = await prisma.taxEntry.create({
      data: {
        type: TaxType.TAXA,
        currency,
        material,
        amount,
        validUntil: plusHours(4),
        cnp,
        userId: req.user.id,
        payment: metoda,
        familyId,
      },
    });

    res.json({ ok: true, id: entry.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

app.get("/taxe", auth(), async (_req, res) => {
  try {
    const now = new Date();
    const rows = await prisma.taxEntry.findMany({
      where: { type: TaxType.TAXA, validUntil: { gt: now } },
      include: { family: true },
      orderBy: { createdAt: "desc" },
    });
    const out = rows.map((r) => ({
      id: r.id,
      cnp: r.cnp,
      tip:
        r.currency === "CLEAN"
          ? "Bani curați"
          : r.currency === "DIRTY"
          ? "Bani murdari"
          : r.material === "OTEL"
          ? "Oțel"
          : "Praf de pușcă",
      amount: r.amount,
      metoda: r.payment,
      gratisFamilie: r.family?.name || null,
      remaining: r.validUntil ? timeLeft(r.validUntil) : null,
    }));
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

// ========= BURGHIU =========
// "Metodă plată" = CLEAN (Bani curați) 650$/buc, DIRTY (Bani murdari) 1000$/buc
app.post("/drill", auth(), async (req, res) => {
  try {
    const { cnp, part, family, quantity, cashType } = req.body || {};
    if (!/^\d{1,6}$/.test(cnp || ""))
      return res.status(400).json({ error: "CNP invalid" });
    if (!["cadru", "teava", "mecanism", "fixare"].includes(part))
      return res.status(400).json({ error: "piesă invalidă" });
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0)
      return res.status(400).json({ error: "cantitate invalidă" });

    const isDirty = String(cashType).toUpperCase() === "DIRTY";
    const unitPrice = isDirty ? 1000 : 650;

    const fam = family
      ? await prisma.family.findUnique({ where: { name: family } })
      : null;
    const famId = fam ? fam.id : null;

    const data = {
      cnp,
      processed: qty,
      cadru: 0,
      mecanism: 0,
      teava: 0,
      fixare: 0,
      cashType: isDirty ? CashType.DIRTY : CashType.CLEAN,
      unitPrice,
      userId: req.user.id,
      familyId: famId,
    };
    if (part === "cadru") data.cadru = qty;
    if (part === "mecanism") data.mecanism = qty;
    if (part === "teava") data.teava = qty;
    if (part === "fixare") data.fixare = qty;

    // creează job-ul de burghiu
    const job = await prisma.drillJob.create({ data });

    // log pentru bani (contorizare separată CLEAN/DIRTY)
    await prisma.taxEntry.create({
      data: {
        type: TaxType.BURGHIU,
        currency: isDirty ? Currency.DIRTY : Currency.CLEAN,
        amount: qty * unitPrice, // suma totală
        cnp,
        userId: req.user.id,
        familyId: famId,
        payment: isDirty ? "Bani murdari" : "Bani curați",
      },
    });

    res.json({ ok: true, id: job.id, cost: qty * unitPrice });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

app.get("/drill", auth(), async (_req, res) => {
  try {
    const list = await prisma.drillJob.findMany({
      include: { family: true },
      orderBy: { createdAt: "desc" },
      take: 100,
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
        metodaPlata: j.cashType === "DIRTY" ? "Bani murdari" : "Bani curați",
        costTotal: j.processed * j.unitPrice,
        family: j.family?.name || null,
        createdAt: j.createdAt,
      }))
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

// ========= FAMILII =========
app.get("/families", auth(false), async (_req, res) => {
  const list = await prisma.family.findMany({ orderBy: { name: "asc" } });
  res.json(list);
});

// ========= ADMIN DASHBOARD =========
app.get(
  "/admin/stats",
  auth(),
  requireRole(Role.ADMIN, Role.HEAD_OPERATOR),
  async (_req, res) => {
    try {
      const users = await prisma.user.findMany({
        include: {
          taxEntries: true,
          drillJobs: true,
        },
      });
      const stats = users.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        taxeCount: u.taxEntries.length,
        drillCount: u.drillJobs.length,
      }));
      res.json(stats);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "eroare server" });
    }
  }
);

(async () => {
  await ensureFamilies();
  await bootstrapAdminInvite();
  app.listen(PORT, HOST, () =>
    console.log(`Listening on http://${HOST}:${PORT}`)
  );
})();
