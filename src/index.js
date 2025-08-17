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

app.use(express.static(path.join(__dirname, "../public")));
app.get("/", (_req, res) =>
  res.sendFile(path.join(__dirname, "../public/index.html"))
);

// ========== SSE pentru live ==========
const sseClients = new Set();
function sseBroadcast(event, payload = {}) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  sseClients.forEach((res) => { try { res.write(msg); } catch {} });
}
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  sseClients.add(res);
  const hb = setInterval(() => { try { res.write("event: ping\ndata: {}\n\n"); } catch {} }, 25000);
  req.on("close", () => { clearInterval(hb); sseClients.delete(res); });
});

// ========== Utils timp/săptămână ==========
function plusHours(h) { return new Date(Date.now() + h * 3600 * 1000); }
function timeLeft(until) {
  const ms = until.getTime() - Date.now();
  const h = Math.max(0, Math.floor(ms / 3600000));
  const m = Math.max(0, Math.floor((ms % 3600000) / 60000));
  return `${h}h ${m}m`;
}
function mondayOfISOWeek(year, week){
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const start = new Date(simple);
  if (dow <= 4) start.setUTCDate(simple.getUTCDate() - dow + 1);
  else start.setUTCDate(simple.getUTCDate() + 8 - dow);
  return start;
}
function weekBounds(year, week){
  const start = mondayOfISOWeek(year, week);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

// ========== Families seed ==========
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

// ========== Auth middlewares ==========
function auth(required = true) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return required ? res.status(401).json({ error: "no token" }) : next();
    try { req.user = jwt.verify(token, JWT_SECRET); next(); }
    catch { return res.status(401).json({ error: "invalid token" }); }
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

// ========== AUTH ==========
app.post("/auth/register", async (req, res) => {
  try {
    const { username, password, nickname, cnp, inviteCode, email } = req.body || {};
    if (!username || !password || !inviteCode) return res.status(400).json({ error: "date lipsă" });
    if (cnp && !/^\d{1,6}$/.test(cnp)) return res.status(400).json({ error: "CNP invalid (max 6 cifre)" });

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
  } catch (e) { res.status(500).json({ error: "eroare server" }); }
});

app.post("/auth/login", async (req, res) => {
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

app.get("/auth/me", auth(), async (req, res) => {
  const me = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, username: true, role: true, nickname: true },
  });
  res.json(me);
});

app.post("/auth/change-password", auth(), async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "parola prea scurtă" });
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const ok = await bcrypt.compare(oldPassword || "", user?.password || "");
    if (!ok) return res.status(400).json({ error: "parola veche greșită" });
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.user.id }, data: { password: hash } });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "eroare server" }); }
});

// ========== INVITES ==========
app.post("/invites", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR), async (req, res) => {
  const { role } = req.body || {};
  const r = role && Object.values(Role).includes(role) ? role : Role.OPERATOR;
  const code = Math.random().toString(36).slice(2, 10).toUpperCase();
  const inv = await prisma.invite.create({ data: { code, role: r, createdById: req.user.id } });
  res.json({ code: inv.code, role: inv.role, link: `${req.headers.origin || ""}/?invite=${inv.code}` });
});

app.get("/invites", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR), async (_req, res) => {
  const list = await prisma.invite.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  res.json(list);
});

// ========== TAXE (doar curat/murdar/gratis) ==========
app.post("/taxe", auth(), async (req, res) => {
  try {
    if (req.user.role === Role.AUDIT) return res.status(403).json({ error: "forbidden" });

    const { cnp, metoda, gratisFamilie } = req.body || {};
    if (!/^\d{1,6}$/.test(cnp || "")) return res.status(400).json({ error: "CNP invalid (max 6 cifre)" });
    if (!["curat", "murdar", "gratis"].includes(metoda)) return res.status(400).json({ error: "metodă invalidă" });

    const now = new Date();
    const existing = await prisma.taxEntry.findFirst({
      where: { type: TaxType.TAXA, cnp, validUntil: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return res.status(409).json({ error: "Există deja o taxă activă pe acest CNP." });

    let currency = Currency.CLEAN, amount = 0, familyId = null, payment = "Bani curați";
    if (metoda === "curat") { currency = Currency.CLEAN; amount = 40000; payment = "Bani curați"; }
    else if (metoda === "murdar") { currency = Currency.DIRTY; amount = 60000; payment = "Bani murdari"; }
    else if (metoda === "gratis") {
      if (!["Medelin Cartel", "818", "Stefanos Cartel"].includes(gratisFamilie))
        return res.status(400).json({ error: "familie invalidă pt. gratis" });
      const fam = await prisma.family.findUnique({ where: { name: gratisFamilie } });
      if (!fam) return res.status(400).json({ error: "familia nu există" });
      familyId = fam.id; currency = Currency.CLEAN; amount = 0; payment = "GRATIS";
    }

    const entry = await prisma.taxEntry.create({
      data: {
        type: TaxType.TAXA,
        currency, amount,
        validUntil: plusHours(4),
        cnp, userId: req.user.id, payment, familyId,
      },
    });

    sseBroadcast("taxe:new", { id: entry.id, cnp: entry.cnp });
    res.json({ ok: true, id: entry.id });
  } catch (e) { res.status(500).json({ error: "eroare server" }); }
});

app.get("/taxe", auth(), async (_req, res) => {
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
      tip: r.payment === "GRATIS" ? "GRATIS" : (r.currency === "CLEAN" ? "Bani curați" : "Bani murdari"),
      amount: r.amount,
      metoda: r.payment,
      gratisFamilie: r.family?.name || null,
      remaining: r.validUntil ? timeLeft(r.validUntil) : null,
      createdAt: r.createdAt,
      user: r.user?.username || null,
    }));
    res.json(out);
  } catch (e) { res.status(500).json({ error: "eroare server" }); }
});

// ========== BURGHIU (o singură linie / cerere) ==========
app.post("/drill", auth(), async (req, res) => {
  try {
    if (req.user.role === Role.AUDIT) return res.status(403).json({ error: "forbidden" });

    const { cnp, family, cadru = 0, teava = 0, mecanism = 0, fixare = 0 } = req.body || {};
    if (!/^\d{1,6}$/.test(cnp || "")) return res.status(400).json({ error: "CNP invalid" });

    const qtys = [cadru, teava, mecanism, fixare].map(Number).map(x => isFinite(x) ? x : 0);
    const total = qtys.reduce((a,b)=>a+b,0);
    if (total <= 0) return res.status(400).json({ error: "introdu minim o cantitate" });

    const fam = family ? await prisma.family.findUnique({ where: { name: family } }) : null;

    const job = await prisma.drillJob.create({
      data: {
        cnp,
        cadru: qtys[0], teava: qtys[1], mecanism: qtys[2], fixare: qtys[3],
        processed: total,
        cashType: CashType.DIRTY,
        unitPrice: 1000,
        userId: req.user.id,
        familyId: fam ? fam.id : null,
      }
    });

    await prisma.taxEntry.create({
      data: {
        type: TaxType.BURGHIU,
        currency: Currency.DIRTY,
        amount: total * 1000,
        cnp,
        userId: req.user.id,
        familyId: fam ? fam.id : null,
        payment: "Bani murdari",
      },
    });

    sseBroadcast("drill:new", { id: job.id, cnp });
    res.json({ ok: true, id: job.id, cost: total * 1000 });
  } catch (e) { res.status(500).json({ error: "eroare server" }); }
});

app.get("/drill", auth(), async (_req, res) => {
  try {
    const list = await prisma.drillJob.findMany({
      include: { family: true, user: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    res.json(list.map(j => ({
      id: j.id, cnp: j.cnp,
      cadru: j.cadru, teava: j.teava, mecanism: j.mecanism, fixare: j.fixare,
      qty: j.processed, metodaPlata: "Bani murdari",
      costTotal: j.processed * j.unitPrice,
      family: j.family?.name || null,
      createdAt: j.createdAt, user: j.user?.username || null,
    })));
  } catch (e) { res.status(500).json({ error: "eroare server" }); }
});

// ========== FAMILII ==========
app.get("/families", auth(false), async (_req, res) => {
  const list = await prisma.family.findMany({ orderBy: { name: "asc" } });
  res.json(list);
});

// ========== Burghiu Familii (week/all) ==========
app.get("/admin/drill-families", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR, Role.OPERATOR), async (req, res) => {
  try {
    const period = (req.query.period || "week").toString();
    let where = {};
    if (period === "week") {
      const y = Number(req.query.year), w = Number(req.query.week);
      if (!Number.isNaN(y) && !Number.isNaN(w)) {
        const { start, end } = weekBounds(y, w);
        where.createdAt = { gte: start, lt: end };
      }
    }
    const jobs = await prisma.drillJob.findMany({ where, include: { family: true } });
    const map = new Map();
    for (const j of jobs) {
      const fam = j.family?.name || "(fără)";
      const row = map.get(fam) || { family: fam, cadru:0, teava:0, mecanism:0, fixare:0, total:0 };
      row.cadru += j.cadru; row.teava += j.teava; row.mecanism += j.mecanism; row.fixare += j.fixare;
      row.total += (j.cadru + j.teava + j.mecanism + j.fixare);
      map.set(fam, row);
    }
    res.json([...map.values()].sort((a,b)=>b.total-a.total));
  } catch (e) { res.status(500).json({ error: "eroare server" }); }
});

// ========== My Profile & View-As ==========
async function profileForUser(userId, y, w) {
  let whereTax = { userId };
  let whereDrill = { userId };
  if (!Number.isNaN(y) && !Number.isNaN(w)) {
    const { start, end } = weekBounds(y, w);
    whereTax.createdAt = { gte: start, lt: end };
    whereDrill.createdAt = { gte: start, lt: end };
  }

  const taxes = await prisma.taxEntry.findMany({ where: { ...whereTax, type: TaxType.TAXA }, orderBy: { createdAt: "desc" } });
  const drill = await prisma.drillJob.findMany({ where: whereDrill, orderBy: { createdAt: "desc" }, include: { family: true } });

  let clean = 0, dirty = 0, count = 0;
  for (const t of taxes) {
    if (t.payment === "GRATIS") { count++; continue; }
    if (t.currency === "CLEAN") clean += 40000; else if (t.currency === "DIRTY") dirty += 60000;
    count++;
  }
  let pieces = 0, drillMoney = 0;
  for (const j of drill) {
    const p = j.cadru + j.teava + j.mecanism + j.fixare;
    pieces += p; drillMoney += p * 1000;
  }
  const totalMoney = clean + dirty + drillMoney;
  return {
    taxes: { count, clean, dirty },
    drill: { pieces, money: drillMoney },
    split: { userShare: Math.floor(totalMoney * 0.5), familyShare: totalMoney - Math.floor(totalMoney * 0.5), total: totalMoney },
  };
}

app.get("/me/profile", auth(), async (req, res) => {
  try {
    const y = Number(req.query.year), w = Number(req.query.week);
    const data = await profileForUser(req.user.id, y, w);
    res.json(data);
  } catch { res.status(500).json({ error: "eroare server" }); }
});

app.get("/admin/users/:id/profile", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const y = Number(req.query.year), w = Number(req.query.week);
    const user = await prisma.user.findUnique({ where: { id }, select: { id:true, username:true } });
    if (!user) return res.status(404).json({ error: "user inexistent" });
    const data = await profileForUser(id, y, w);
    res.json({ user, ...data });
  } catch { res.status(500).json({ error: "eroare server" }); }
});

// ========== Tabele All (listare + delete) ==========
app.get("/admin/all", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR), async (req, res) => {
  try {
    const type = (req.query.type || "taxe").toString(); // taxe|drill
    const y = Number(req.query.year), w = Number(req.query.week);
    const cnp = (req.query.cnp || "").toString().trim();
    const user = (req.query.user || "").toString().trim();
    const family = (req.query.family || "").toString().trim();

    const where = {};
    if (!Number.isNaN(y) && !Number.isNaN(w)) {
      const { start, end } = weekBounds(y, w);
      where.createdAt = { gte: start, lt: end };
    }
    if (cnp) where.cnp = { contains: cnp };
    if (family) where.family = { name: { contains: family } };

    if (type === "taxe") {
      const rows = await prisma.taxEntry.findMany({
        where, include: { user: true, family: true }, orderBy: { createdAt: "desc" }, take: 500
      });
      const out = rows
        .filter(r => !user || (r.user?.username || "").toLowerCase().includes(user.toLowerCase()))
        .map(r => ({
          id: r.id, type: "taxe", cnp: r.cnp, payment: r.payment, amount: r.amount,
          user: r.user?.username || "-", family: r.family?.name || null, createdAt: r.createdAt
        }));
      return res.json(out);
    } else {
      const rows = await prisma.drillJob.findMany({
        where, include: { user: true, family: true }, orderBy: { createdAt: "desc" }, take: 500
      });
      const out = rows
        .filter(r => !user || (r.user?.username || "").toLowerCase().includes(user.toLowerCase()))
        .map(r => ({
          id: r.id, type: "drill", cnp: r.cnp, cadru: r.cadru, teava: r.teava, mecanism: r.mecanism, fixare: r.fixare,
          user: r.user?.username || "-", family: r.family?.name || null, createdAt: r.createdAt
        }));
      return res.json(out);
    }
  } catch { res.status(500).json({ error: "eroare server" }); }
});

app.delete("/admin/taxe/:id", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR), async (req, res) => {
  try { await prisma.taxEntry.delete({ where: { id: Number(req.params.id) } }); res.json({ ok:true }); sseBroadcast("taxe:new", {}); }
  catch { res.status(500).json({ error: "nu am putut șterge" }); }
});
app.delete("/admin/drill/:id", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR), async (req, res) => {
  try { await prisma.drillJob.delete({ where: { id: Number(req.params.id) } }); res.json({ ok:true }); sseBroadcast("drill:new", {}); }
  catch { res.status(500).json({ error: "nu am putut șterge" }); }
});

// ========== Start ==========
(async () => {
  await ensureFamilies();
  await bootstrapAdminInvite();
  app.listen(PORT, HOST, () => console.log(`Listening on http://${HOST}:${PORT}`));
})();
