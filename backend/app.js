// backend/app.js
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import prisma, { isoWeekRange } from "./db.js";
import { Role, TaxType, Currency, CashType } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
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
  { name: "BACM", colorHex: "#d4af37" }
];

function plusHours(h) { return new Date(Date.now() + h * 3600 * 1000); }
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
      update: { colorHex: f.colorHex }
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
    console.log("Admin invite:", code);
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
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: "forbidden" });
    next();
  };
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/health/db", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR, Role.AUDIT), async (_req, res) => {
  const [u,t,d] = await Promise.all([
    prisma.user.count(),
    prisma.taxEntry.count(),
    prisma.drillJob.count()
  ]);
  res.json({ users:u, taxEntries:t, drillJobs:d });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password, nickname, cnp, inviteCode, email } = req.body || {};
    if (!username || !password || !inviteCode) return res.status(400).json({ error: "date lipsă" });
    if (cnp && !/^\d{1,6}$/.test(cnp)) return res.status(400).json({ error: "CNP invalid (max 6)" });
    const invite = await prisma.invite.findUnique({ where: { code: inviteCode } });
    if (!invite || invite.usedAt) return res.status(400).json({ error: "invitație invalidă/folosită" });
    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) return res.status(400).json({ error: "username ocupat" });
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, password: hash, nickname: nickname || username, cnp: cnp || null, email: email || null, role: invite.role }
    });
    await prisma.invite.update({ where: { id: invite.id }, data: { usedAt: new Date(), usedById: user.id } });
    const token = jwt.sign({ id: user.id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, role: user.role, username: user.username });
  } catch { res.status(500).json({ error: "eroare server" }); }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(400).json({ error: "credentiale invalide" });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "credentiale invalide" });
    const token = jwt.sign({ id: user.id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, role: user.role, username: user.username });
  } catch { res.status(500).json({ error: "eroare server" }); }
});
app.get("/api/auth/me", auth(), async (req, res) => {
  const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id:true, username:true, role:true, nickname:true } });
  res.json(me);
});

app.post("/api/invites", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR), async (req, res) => {
  const { role } = req.body || {};
  const r = role && Object.values(Role).includes(role) ? role : Role.OPERATOR;
  const code = Math.random().toString(36).slice(2, 10).toUpperCase();
  const inv = await prisma.invite.create({ data: { code, role: r, createdById: req.user.id } });
  res.json({ code: inv.code, role: inv.role });
});

app.post("/api/taxe", auth(), async (req, res) => {
  try {
    const { cnp, metoda, gratisFamilie } = req.body || {};
    if (!/^\d{1,6}$/.test(cnp || "")) return res.status(400).json({ error: "CNP invalid" });
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

    if (metoda === "curat") { currency = Currency.CLEAN; amount = 40000; }
    else if (metoda === "murdar") { currency = Currency.DIRTY; amount = 60000; }
    else if (metoda === "gratis") {
      if (!["Medelin Cartel", "818", "Stefanos Cartel"].includes(gratisFamilie)) return res.status(400).json({ error: "familie invalidă pt. gratis" });
      const fam = await prisma.family.findUnique({ where: { name: gratisFamilie } });
      if (!fam) return res.status(400).json({ error: "familia nu există" });
      familyId = fam.id; currency = Currency.CLEAN; amount = 0;
    }

    const entry = await prisma.taxEntry.create({
      data: { type: TaxType.TAXA, currency, amount, validUntil: plusHours(4), cnp, userId: req.user.id, payment: metoda, familyId },
      include: { user: true, family: true }
    });
    try { sseBroadcast("taxe:new", { id: entry.id }); } catch {}
    res.json({ ok: true, id: entry.id });
  } catch (e) { console.error(e); res.status(500).json({ error: "eroare server" }); }
});

app.get("/api/taxe", auth(), async (req, res) => {
  try {
    const { scope, year, week } = req.query;
    const now = new Date();
    let where = { type: TaxType.TAXA };
    if (!scope) where = { ...where, validUntil: { gt: now } };
    if (scope === "all") { /* no time filter */ }
    if (scope === "week" && year && week) {
      const { start, end } = isoWeekRange(Number(year), Number(week));
      where = { ...where, createdAt: { gte: start, lt: end } };
    }
    const rows = await prisma.taxEntry.findMany({
      where,
      include: { family: true, user: true },
      orderBy: { createdAt: "desc" }
    });
    const out = rows.map(r => ({
      id: r.id,
      cnp: r.cnp,
      tip: r.payment === "gratis" ? "GRATIS" : (r.currency === "CLEAN" ? "Bani curați" : "Bani murdari"),
      amount: r.payment === "gratis" ? 0 : (r.currency === "CLEAN" ? 40000 : 60000),
      metoda: r.payment,
      gratisFamilie: r.family?.name || null,
      remaining: r.validUntil ? timeLeft(r.validUntil) : null,
      createdAt: r.createdAt,
      user: r.user?.username || ""
    }));
    res.json(out);
  } catch (e) { console.error(e); res.status(500).json({ error: "eroare server" }); }
});

app.delete("/api/taxe/:id", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalid" });
  await prisma.taxEntry.delete({ where: { id } }).catch(() => null);
  res.json({ ok: true });
});

app.post("/api/drill", auth(), async (req, res) => {
  try {
    const { cnp, part, family, quantity } = req.body || {};
    if (!/^\d{1,6}$/.test(cnp || "")) return res.status(400).json({ error: "CNP invalid" });
    if (!["cadru", "teava", "mecanism", "fixare"].includes(part)) return res.status(400).json({ error: "piesă invalidă" });
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: "cantitate invalidă" });

    const isGratisFamily = ["Medelin Cartel", "818", "Stefanos Cartel"].includes(family);
    const unitPrice = isGratisFamily ? 0 : 1000;

    const fam = family ? await prisma.family.findUnique({ where: { name: family } }) : null;
    const famId = fam ? fam.id : null;

    const data = { cnp, processed: qty, cadru: 0, mecanism: 0, teava: 0, fixare: 0, cashType: CashType.DIRTY, unitPrice, userId: req.user.id, familyId: famId };
    if (part === "cadru") data.cadru = qty;
    if (part === "mecanism") data.mecanism = qty;
    if (part === "teava") data.teava = qty;
    if (part === "fixare") data.fixare = qty;

    const job = await prisma.drillJob.create({ data, include: { user: true, family: true } });

    await prisma.taxEntry.create({
      data: { type: TaxType.BURGHIU, currency: Currency.DIRTY, amount: qty * unitPrice, cnp, userId: req.user.id, familyId: famId, payment: isGratisFamily ? "GRATIS" : "Bani murdari" }
    });

    try { sseBroadcast("drill:new", { id: job.id }); } catch {}
    res.json({ ok: true, id: job.id, cost: qty * unitPrice });
  } catch (e) { console.error(e); res.status(500).json({ error: "eroare server" }); }
});

app.get("/api/drill", auth(), async (req, res) => {
  try {
    const { scope, year, week } = req.query;
    let where = {};
    if (scope === "week" && year && week) {
      const { start, end } = isoWeekRange(Number(year), Number(week));
      where = { ...where, createdAt: { gte: start, lt: end } };
    }
    const list = await prisma.drillJob.findMany({
      where,
      include: { family: true, user: true },
      orderBy: { createdAt: "desc" },
      take: scope ? undefined : 50
    });
    res.json(list.map(j => ({
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
      createdAt: j.createdAt
    })));
  } catch (e) { console.error(e); res.status(500).json({ error: "eroare server" }); }
});

app.delete("/api/drill/:id", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalid" });
  await prisma.drillJob.delete({ where: { id } }).catch(() => null);
  res.json({ ok: true });
});

app.get("/api/admin/stats", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR, Role.AUDIT), async (req, res) => {
  try {
    const { scope, year, week } = req.query;
    let range = null;
    if (scope === "week" && year && week) range = isoWeekRange(Number(year), Number(week));
    const users = await prisma.user.findMany({
      include: {
        taxEntries: range ? { where: { createdAt: { gte: range.start, lt: range.end } } } : true,
        drillJobs:   range ? { where: { createdAt: { gte: range.start, lt: range.end } } } : true
      }
    });
    const out = users.map(u => {
      let clean = 0, dirty = 0;
      for (const t of u.taxEntries) {
        if (t.type !== "TAXA") continue;
        if (t.payment === "gratis") continue;
        if (t.currency === "CLEAN") clean += 40000;
        else if (t.currency === "DIRTY") dirty += 60000;
      }
      for (const d of u.drillJobs) {
        dirty += d.processed * d.unitPrice;
      }
      const total = clean + dirty;
      return {
        id: u.id,
        username: u.username,
        role: u.role,
        userShareClean: clean * 0.5,
        userShareDirty: dirty * 0.5,
        familyShareClean: clean * 0.5,
        familyShareDirty: dirty * 0.5,
        totalClean: clean,
        totalDirty: dirty,
        total
      };
    });
    out.sort((a,b)=>b.total-a.total);
    res.json(out);
  } catch (e) { console.error(e); res.status(500).json({ error: "eroare server" }); }
});

let sseClients = [];
app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  const client = { id: Date.now(), res };
  sseClients.push(client);
  const keep = setInterval(() => { try { res.write(`event: ping\ndata: {}\n\n`); } catch {} }, 25000);
  req.on("close", () => {
    clearInterval(keep);
    sseClients = sseClients.filter(c => c !== client);
  });
});
function sseBroadcast(event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload || {})}\n\n`;
  for (const c of sseClients) { try { c.res.write(data); } catch {} }
}

const FRONT_DIR = path.join(__dirname, "../frontend");
app.use(express.static(FRONT_DIR));
app.get("/", (_req, res) => res.sendFile(path.join(FRONT_DIR, "index.html")));
app.get("/taxe", (_req, res) => res.sendFile(path.join(FRONT_DIR, "pages/taxe.html")));
app.get("/dashboard", (_req, res) => res.sendFile(path.join(FRONT_DIR, "pages/dashboard.html")));
app.get("/families", (_req, res) => res.sendFile(path.join(FRONT_DIR, "pages/families.html")));
app.get("/admin", (_req, res) => res.sendFile(path.join(FRONT_DIR, "pages/admin.html")));
app.get("/tables", (_req, res) => res.sendFile(path.join(FRONT_DIR, "pages/tables.html")));
app.get("/profile", (_req, res) => res.sendFile(path.join(FRONT_DIR, "pages/profile.html")));

(async () => {
  await ensureFamilies();
  await bootstrapAdminInvite();
  app.listen(PORT, HOST, () => console.log(`Listening on http://${HOST}:${PORT}`));
})();
