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

const prisma = new PrismaClient();
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8081;
const HOST = "0.0.0.0";
const JWT_SECRET = process.env.JWT_SECRET || "change-me";
const FRONT_ORIGIN = process.env.FRONT_ORIGIN || "*";

// -------- middleware
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", FRONT_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});
app.use(express.static(path.join(__dirname, "../public")));
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "../public/index.html")));

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
const FREE_FAMILIES = new Set(["818", "Medelin Cartel", "Stefanos Cartel"]);

function plusHours(h) { return new Date(Date.now() + h * 3600 * 1000); }
function timeLeft(until) {
  const ms = until.getTime() - Date.now();
  const h = Math.max(0, Math.floor(ms / 3600000));
  const m = Math.max(0, Math.floor((ms % 3600000) / 60000));
  return `${h}h ${m}m`;
}
async function ensureFamilies() {
  for (const f of FAMILIES) {
    await prisma.family.upsert({ where: { name: f.name }, create: f, update: { colorHex: f.colorHex } });
  }
}
async function bootstrapAdminInvite() {
  const code = process.env.ADMIN_INVITE_CODE;
  if (!code) return;
  const users = await prisma.user.count();
  const exists = await prisma.invite.findUnique({ where: { code } });
  if (users === 0 && !exists) await prisma.invite.create({ data: { code, role: Role.ADMIN } });
}

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
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: "forbidden" });
    next();
  };
}

// ----- SSE
const clients = new Set();
function broadcast(event, data = {}) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) { try { res.write(msg); } catch {} }
}
app.get("/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  res.write("retry: 3000\n\n");
  clients.add(res);
  const iv = setInterval(() => { try { res.write("event: ping\ndata: {}\n\n"); } catch {} }, 25000);
  req.on("close", () => { clearInterval(iv); clients.delete(res); });
});

app.get("/health", (_, res) => res.json({ ok: true }));

// ===== AUTH
app.post("/auth/register", async (req, res) => {
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
    select: { id: true, username: true, role: true, nickname: true }
  });
  res.json(me);
});
app.post("/auth/change-password", auth(), async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const ok = await bcrypt.compare(oldPassword, user.password);
    if (!ok) return res.status(400).json({ error: "parolă greșită" });
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { password: hash } });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "eroare server" }); }
});

// ===== INVITES
app.post("/invites", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR), async (req, res) => {
  const { role } = req.body || {};
  const r = role && Object.values(Role).includes(role) ? role : Role.OPERATOR;
  const code = Math.random().toString(36).slice(2, 10).toUpperCase();
  const inv = await prisma.invite.create({ data: { code, role: r, createdById: req.user.id } });
  res.json({ code: inv.code, role: inv.role, link: `${req.headers.origin || ""}/?invite=${inv.code}` });
});
app.get("/invites", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR), async (_, res) => {
  const list = await prisma.invite.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  res.json(list);
});

// ===== TAXE (NUMAI curat/murdar/gratis). AUDIT NU poate crea.
app.post("/taxe", auth(), requireRole(Role.OPERATOR, Role.HEAD_OPERATOR, Role.ADMIN), async (req, res) => {
  try {
    const { cnp, metoda, gratisFamilie } = req.body || {};
    if (!/^\d{1,6}$/.test(cnp || "")) return res.status(400).json({ error: "CNP invalid" });
    if (!["curat", "murdar", "gratis"].includes(metoda)) return res.status(400).json({ error: "metodă invalidă" });

    // nu permitem dublură activă pe CNP (4h)
    const now = new Date();
    const existing = await prisma.taxEntry.findFirst({
      where: { type: TaxType.TAXA, cnp, validUntil: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return res.status(409).json({ error: "Există deja o taxă activă pe acest CNP." });

    let currency = Currency.CLEAN, amount = 0, familyId = null, payment = metoda;
    if (metoda === "curat")  { currency = Currency.CLEAN; amount = 40000; }
    if (metoda === "murdar") { currency = Currency.DIRTY; amount = 60000; }
    if (metoda === "gratis") {
      if (!["Medelin Cartel", "818", "Stefanos Cartel"].includes(gratisFamilie))
        return res.status(400).json({ error: "familie invalidă pt. gratis" });
      const fam = await prisma.family.findUnique({ where: { name: gratisFamilie } });
      if (!fam) return res.status(400).json({ error: "familia nu există" });
      familyId = fam.id;
      payment = "GRATIS";
    }

    const entry = await prisma.taxEntry.create({
      data: {
        type: TaxType.TAXA, currency, amount,
        validUntil: plusHours(4),
        cnp, userId: req.user.id, payment, familyId,
      },
    });

    broadcast("taxe:new", { id: entry.id });
    res.json({ ok: true, id: entry.id });
  } catch { res.status(500).json({ error: "eroare server" }); }
});
app.get("/taxe", auth(), async (_, res) => {
  try {
    const now = new Date();
    const rows = await prisma.taxEntry.findMany({
      where: { type: TaxType.TAXA, validUntil: { gt: now } },
      include: { family: true, user: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(rows.map(r => ({
      id: r.id,
      cnp: r.cnp,
      tip: r.payment === "GRATIS" ? "GRATIS" : (r.currency === "CLEAN" ? "Bani curați" : "Bani murdari"),
      amount: r.amount,
      metoda: r.payment,
      gratisFamilie: r.family?.name || null,
      remaining: r.validUntil ? timeLeft(r.validUntil) : null,
      createdAt: r.createdAt,
      user: r.user?.username || null,
    })));
  } catch { res.status(500).json({ error: "eroare server" }); }
});

// ===== BURGHIU (o singură înregistrare cu toate componentele; 818/Medelin/Stefanos = GRATIS). AUDIT NU poate crea.
app.post("/drill", auth(), requireRole(Role.OPERATOR, Role.HEAD_OPERATOR, Role.ADMIN), async (req, res) => {
  try {
    const { cnp, family, cadru = 0, teava = 0, mecanism = 0, fixare = 0 } = req.body || {};
    if (!/^\d{1,6}$/.test(cnp || "")) return res.status(400).json({ error: "CNP invalid" });

    const fam = family ? await prisma.family.findUnique({ where: { name: family } }) : null;
    const famId = fam ? fam.id : null;

    const qty = Number(cadru) + Number(teava) + Number(mecanism) + Number(fixare);
    if (!qty) return res.status(400).json({ error: "cantități invalide" });

    const isGratis = fam && FREE_FAMILIES.has(fam.name);
    const unitPrice = isGratis ? 0 : 1000;

    const job = await prisma.drillJob.create({
      data: {
        cnp,
        cadru: Number(cadru) || 0,
        teava: Number(teava) || 0,
        mecanism: Number(mecanism) || 0,
        fixare: Number(fixare) || 0,
        processed: qty,
        cashType: isGratis ? CashType.CLEAN : CashType.DIRTY, // doar informativ
        unitPrice,
        userId: req.user.id,
        familyId: famId,
      }
    });

    await prisma.taxEntry.create({
      data: {
        type: TaxType.BURGHIU,
        currency: isGratis ? Currency.CLEAN : Currency.DIRTY,
        amount: qty * unitPrice, // 0 dacă e gratis
        cnp,
        userId: req.user.id,
        familyId: famId,
        payment: isGratis ? "GRATIS" : "Bani murdari",
      }
    });

    broadcast("drill:new", { id: job.id });
    res.json({ ok: true, id: job.id, cost: qty * unitPrice });
  } catch { res.status(500).json({ error: "eroare server" }); }
});
app.get("/drill", auth(), async (_, res) => {
  const list = await prisma.drillJob.findMany({
    include: { family: true, user: { select: { username: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  res.json(list.map(j => ({
    id: j.id, cnp: j.cnp,
    cadru: j.cadru, teava: j.teava, mecanism: j.mecanism, fixare: j.fixare,
    qty: j.processed,
    costTotal: j.unitPrice * j.processed,
    family: j.family?.name || null,
    user: j.user?.username || null,
    createdAt: j.createdAt,
  })));
});

// ===== util săptămână
function isoYearWeek(d){
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((date - yearStart)/86400000)+1)/7);
  return { year: date.getUTCFullYear(), week: weekNo };
}
function mondayOfISOWeek(year, week){
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const start = new Date(simple);
  if (dow <= 4) start.setUTCDate(simple.getUTCDate() - dow + 1);
  else start.setUTCDate(simple.getUTCDate() + 8 - dow);
  start.setUTCHours(0,0,0,0);
  return start;
}
function inWeek(dt, year, week){
  const start = mondayOfISOWeek(year, week);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);
  return dt >= start && dt < end;
}

// ===== Admin: sumar per user cu split curat/murdar
app.get("/admin/stats", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR), async (req, res) => {
  const { year, week } = req.query;

  const users = await prisma.user.findMany({
    include: { taxEntries: true } // TAXA + BURGHIU (ambele)
  });

  const rows = users.map(u => {
    const entries = u.taxEntries.filter(e => {
      if (year && week) return inWeek(e.createdAt, Number(year), Number(week));
      return true;
    });

    const clean = entries.filter(e => e.currency === "CLEAN").reduce((s,e)=>s+(e.amount||0),0);
    const dirty = entries.filter(e => e.currency === "DIRTY").reduce((s,e)=>s+(e.amount||0),0);

    const userCleanShare   = Math.floor(clean * 0.5);
    const familyCleanShare = clean - userCleanShare;
    const userDirtyShare   = Math.floor(dirty * 0.5);
    const familyDirtyShare = dirty - userDirtyShare;

    return {
      username: u.username,
      clean, dirty,
      total: clean + dirty,
      userCleanShare, userDirtyShare,
      familyCleanShare, familyDirtyShare
    };
  });

  res.json(rows);
});

// ===== Admin: burghiu familii (pe componente) + search
app.get("/admin/drill-families", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR), async (req, res) => {
  const { period = "week", year, week, q = "" } = req.query;
  const jobs = await prisma.drillJob.findMany({ include: { family: true } });

  const out = new Map();
  jobs.forEach(j => {
    if (period === "week" && year && week) {
      if (!inWeek(j.createdAt, Number(year), Number(week))) return;
    }
    const fam = j.family?.name || "(fără)";
    if (q && !fam.toLowerCase().includes(String(q).toLowerCase())) return;

    if (!out.has(fam)) out.set(fam, { family: fam, cadru:0, teava:0, mecanism:0, fixare:0, total:0 });
    const r = out.get(fam);
    r.cadru += j.cadru; r.teava += j.teava; r.mecanism += j.mecanism; r.fixare += j.fixare;
    r.total += j.cadru + j.teava + j.mecanism + j.fixare;
  });

  res.json([...out.values()].sort((a,b)=>b.total-a.total));
});

// ===== My profile (detaliu pe zile + splituri)
app.get("/me/profile", auth(), async (req, res) => {
  const { year, week } = req.query;

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { taxEntries: true, drillJobs: true }
  });

  const taxes = user.taxEntries.filter(t => t.type === "TAXA" && (!year || inWeek(t.createdAt, Number(year), Number(week))));
  const drill = user.drillJobs.filter(j => (!year || inWeek(j.createdAt, Number(year), Number(week))));

  const daily = Array.from({length:7}, ()=>({taxe:0, clean:0, dirty:0}));
  taxes.forEach(t=>{
    const d = t.createdAt.getDay(); // 0..6 (Dum..Sâm)
    const idx = (d+6)%7; // Lun..Dum
    daily[idx].taxe += 1;
    if (t.currency === "CLEAN") daily[idx].clean += 40000;
    if (t.currency === "DIRTY") daily[idx].dirty += 60000;
  });

  const cleanSum = taxes.filter(t=>t.currency==="CLEAN").length * 40000;
  const dirtySum = taxes.filter(t=>t.currency==="DIRTY").length * 60000;

  const drillPieces = drill.reduce((s,j)=>s + j.cadru + j.teava + j.mecanism + j.fixare, 0);
  const drillMoney  = drill.reduce((s,j)=>s + j.unitPrice * j.processed, 0); // (0 la gratis)

  const total = cleanSum + dirtySum + drillMoney;
  const userShare = Math.floor(total * 0.5), familyShare = total - userShare;

  res.json({
    daily, cleanSum, dirtySum,
    drill: { pieces: drillPieces, money: drillMoney },
    split: {
      total, userShare, familyShare,
      cleanUser: Math.floor(cleanSum*0.5), cleanFamily: cleanSum - Math.floor(cleanSum*0.5),
      dirtyUser: Math.floor(dirtySum*0.5), dirtyFamily: dirtySum - Math.floor(dirtySum*0.5),
    }
  });
});

// ===== Admin: listări + delete (AUDIT NU are voie)
app.get("/admin/all", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR), async (req, res) => {
  const { type = "taxe", year, week, user, cnp, family } = req.query;
  if (type === "taxe") {
    const rows = await prisma.taxEntry.findMany({
      where: { OR: [{ type: TaxType.TAXA }, { type: TaxType.BURGHIU }] },
      include: { user: { select: { username: true } }, family: true },
      orderBy: { createdAt: "desc" }, take: 500
    });
    const out = rows.filter(r => {
      if (year && week && !inWeek(r.createdAt, Number(year), Number(week))) return false;
      if (user && r.user?.username && !r.user.username.toLowerCase().includes(String(user).toLowerCase())) return false;
      if (cnp && r.cnp && !String(r.cnp).includes(String(cnp))) return false;
      if (family && r.family?.name && !r.family.name.toLowerCase().includes(String(family).toLowerCase())) return false;
      return true;
    }).map(r => ({
      id: r.id, cnp: r.cnp, amount: r.amount, payment: r.payment,
      user: r.user?.username || "", family: r.family?.name || null, createdAt: r.createdAt
    }));
    return res.json(out);
  } else {
    const rows = await prisma.drillJob.findMany({
      include: { user: { select: { username: true } }, family: true },
      orderBy: { createdAt: "desc" }, take: 500
    });
    const out = rows.filter(r => {
      if (year && week && !inWeek(r.createdAt, Number(year), Number(week))) return false;
      if (user && r.user?.username && !r.user.username.toLowerCase().includes(String(user).toLowerCase())) return false;
      if (cnp && r.cnp && !String(r.cnp).includes(String(cnp))) return false;
      if (family && r.family?.name && !r.family.name.toLowerCase().includes(String(family).toLowerCase())) return false;
      return true;
    }).map(j => ({
      id: j.id, cnp: j.cnp, cadru: j.cadru, teava: j.teava, mecanism: j.mecanism, fixare: j.fixare,
      user: j.user?.username || "", family: j.family?.name || null, createdAt: j.createdAt
    }));
    return res.json(out);
  }
});
app.delete("/admin/taxe/:id", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR), async (req, res) => {
  await prisma.taxEntry.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
});
app.delete("/admin/drill/:id", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR), async (req, res) => {
  await prisma.drillJob.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
});

// ---- start
(async () => {
  await ensureFamilies();
  await bootstrapAdminInvite();
  app.listen(PORT, HOST, () => console.log(`Listening on http://${HOST}:${PORT}`));
})();
