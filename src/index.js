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

// ---------- MIDDLEWARE ----------
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", FRONT_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Serve frontend
app.use(express.static(path.join(__dirname, "../public")));
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "../public/index.html"))
);

// ---------- CONST ----------
const GRATIS_FAMILIES = new Set(["Medelin Cartel", "818", "Stefanos Cartel"]);
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
  if (!until) return null;
  const ms = until.getTime() - Date.now();
  const h = Math.max(0, Math.floor(ms / 3600000));
  const m = Math.max(0, Math.floor((ms % 3600000) / 60000));
  return `${h}h ${m}m`;
}

// ---------- BOOTSTRAP ----------
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

// ---------- AUTH HELPERS ----------
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
function forbidAudit(req, res, next) {
  if (req.user?.role === "AUDIT") return res.status(403).json({ error: "AUDIT read-only" });
  next();
}

// ---------- SSE ----------
const clients = new Set();
app.get("/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders?.();
  const client = { res };
  clients.add(client);
  const keep = setInterval(() => {
    try { res.write(`event: ping\ndata: ok\n\n`); } catch {}
  }, 25000);
  req.on("close", () => {
    clearInterval(keep);
    clients.delete(client);
  });
});
function emitEvent(name, payload = {}) {
  const data = `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const c of clients) {
    try { c.res.write(data); } catch {}
  }
}

// ---------- HEALTH ----------
app.get("/health", (_req, res) => res.json({ ok: true }));

// ---------- AUTH ----------
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
  } catch (e) {
    console.error(e);
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
  } catch (e) {
    console.error(e);
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

app.post("/auth/change-password", auth(), async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: "user" });
    const ok = await bcrypt.compare(oldPassword, user.password);
    if (!ok) return res.status(400).json({ error: "parola veche greșită" });
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { password: hash } });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare" });
  }
});

// ---------- INVITES ----------
app.post(
  "/invites",
  auth(),
  requireRole(Role.ADMIN, Role.HEAD_OPERATOR),
  forbidAudit,
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

// ---------- TAXE (curat / murdar / GRATIS) ----------
app.post("/taxe", auth(), forbidAudit, async (req, res) => {
  try {
    const { cnp, metoda, gratisFamilie } = req.body || {};
    if (!/^\d{1,6}$/.test(cnp || ""))
      return res.status(400).json({ error: "CNP invalid (max 6 cifre)" });
    if (!["curat", "murdar", "gratis"].includes(metoda))
      return res.status(400).json({ error: "metodă invalidă" });

    // nu permitem dubluri active 4h pe același CNP
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
    let payment = "";

    if (metoda === "curat") {
      currency = Currency.CLEAN;
      amount = 40000;
      payment = "Bani curați";
    }
    if (metoda === "murdar") {
      currency = Currency.DIRTY;
      amount = 60000;
      payment = "Bani murdari";
    }
    if (metoda === "gratis") {
      if (!GRATIS_FAMILIES.has(gratisFamilie))
        return res.status(400).json({ error: "familie invalidă pt. GRATIS" });
      const fam = await prisma.family.findUnique({ where: { name: gratisFamilie } });
      if (!fam) return res.status(400).json({ error: "familia nu există" });
      familyId = fam.id;
      currency = Currency.CLEAN;
      material = null;
      amount = 0;
      payment = "GRATIS";
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
        payment,
        familyId,
      },
      include: { user: true },
    });

    emitEvent("taxe:new", { id: entry.id });
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
      include: { family: true, user: true },
      orderBy: { createdAt: "desc" },
    });
    const out = rows.map((r) => ({
      id: r.id,
      cnp: r.cnp,
      tip:
        r.payment === "GRATIS"
          ? "GRATIS"
          : r.currency === "CLEAN"
          ? "Bani curați"
          : "Bani murdari",
      amount: r.amount,
      metoda: r.payment,
      gratisFamilie: r.family?.name || null,
      remaining: r.validUntil ? timeLeft(r.validUntil) : null,
      createdAt: r.createdAt,
      user: r.user?.username || null,
    }));
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

// ---------- BURGHIU (Bani murdari, 1000$/buc; GRATIS pentru 818/Medelin/Stefanos) ----------
app.post("/drill", auth(), forbidAudit, async (req, res) => {
  try {
    const { cnp, family, cadru = 0, teava = 0, mecanism = 0, fixare = 0 } = req.body || {};
    if (!/^\d{1,6}$/.test(cnp || ""))
      return res.status(400).json({ error: "CNP invalid (max 6 cifre)" });

    const qtyCadru = Number(cadru) || 0;
    const qtyTeava = Number(teava) || 0;
    const qtyMec = Number(mecanism) || 0;
    const qtyFix = Number(fixare) || 0;
    const totalPieces = qtyCadru + qtyTeava + qtyMec + qtyFix;
    if (totalPieces <= 0) return res.status(400).json({ error: "cantități invalide" });

    const fam = family ? await prisma.family.findUnique({ where: { name: family } }) : null;
    const famId = fam ? fam.id : null;

    const isGratis = fam && GRATIS_FAMILIES.has(fam.name);
    const unitPrice = isGratis ? 0 : 1000; // Bani murdari
    const cost = totalPieces * unitPrice;

    const job = await prisma.drillJob.create({
      data: {
        cnp,
        processed: totalPieces,
        cadru: qtyCadru,
        mecanism: qtyMec,
        teava: qtyTeava,
        fixare: qtyFix,
        cashType: CashType.DIRTY,
        unitPrice,
        userId: req.user.id,
        familyId: famId,
      },
      include: { user: true, family: true },
    });

    // tracking la taxe (BURGHIU) pentru raportare bani murdari
    await prisma.taxEntry.create({
      data: {
        type: TaxType.BURGHIU,
        currency: Currency.DIRTY,
        amount: cost, // 0 dacă e GRATIS
        cnp,
        userId: req.user.id,
        familyId: famId,
        payment: isGratis ? "GRATIS" : "Bani murdari",
      },
    });

    emitEvent("drill:new", { id: job.id });
    res.json({ ok: true, id: job.id, cost });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

app.get("/drill", auth(), async (_req, res) => {
  try {
    const list = await prisma.drillJob.findMany({
      include: { family: true, user: true },
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
        metodaPlata: j.unitPrice === 0 ? "GRATIS" : "Bani murdari",
        costTotal: j.processed * j.unitPrice,
        family: j.family?.name || null,
        createdAt: j.createdAt,
        user: j.user?.username || null,
      }))
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

// ---------- FAMILII ----------
app.get("/families", auth(false), async (_req, res) => {
  const list = await prisma.family.findMany({ orderBy: { name: "asc" } });
  res.json(list);
});

// ---------- DASHBOARD / ADMIN AGG ----------
function inISOWeek(date, year, week) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(y, 0, 1));
  const w = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return y === Number(year) && w === Number(week);
}

// Admin split per user (50/50 pe tip de bani)
app.get(
  "/admin/stats",
  auth(),
  requireRole(Role.ADMIN, Role.HEAD_OPERATOR, Role.AUDIT),
  async (req, res) => {
    try {
      const { year, week, period } = req.query || {};
      const isWeek = (period || "week") === "week" && year && week;

      const users = await prisma.user.findMany({ select: { id: true, username: true } });

      // TAXE: curat/murdar + GRATIS (GRATIS nu intră la bani)
      const taxe = await prisma.taxEntry.findMany({
        where: { type: { in: [TaxType.TAXA, TaxType.BURGHIU] } },
        include: { user: true },
        orderBy: { createdAt: "desc" },
      });

      const map = new Map(); // username -> {clean,dirty}
      for (const u of users) map.set(u.username, { clean: 0, dirty: 0 });

      for (const t of taxe) {
        const dt = t.createdAt;
        if (isWeek && !inISOWeek(dt, year, week)) continue;

        // TAXA (curat/murdar/GRATIS) + BURGHIU (dirty sau gratis)
        if (t.payment === "GRATIS" || t.amount === 0) continue;
        const who = t.user?.username || "(necunoscut)";
        if (!map.has(who)) map.set(who, { clean: 0, dirty: 0 });

        if (t.currency === "CLEAN") map.get(who).clean += t.amount;
        else map.get(who).dirty += t.amount;
      }

      const rows = [...map.entries()].map(([username, v]) => {
        const userCleanShare = Math.round(v.clean * 0.5);
        const userDirtyShare = Math.round(v.dirty * 0.5);
        const familyCleanShare = v.clean - userCleanShare;
        const familyDirtyShare = v.dirty - userDirtyShare;
        return {
          username,
          clean: v.clean,
          dirty: v.dirty,
          total: v.clean + v.dirty,
          userCleanShare,
          userDirtyShare,
          familyCleanShare,
          familyDirtyShare,
        };
      });

      res.json(rows.sort((a, b) => b.total - a.total));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "eroare server" });
    }
  }
);

// Statistici Familii (agregare pe componente)
app.get(
  "/admin/drill-families",
  auth(),
  requireRole(Role.ADMIN, Role.HEAD_OPERATOR, Role.AUDIT),
  async (req, res) => {
    try {
      const { year, week, period, q } = req.query || {};
      const isWeek = (period || "week") === "week" && year && week;

      const jobs = await prisma.drillJob.findMany({
        include: { family: true },
        orderBy: { createdAt: "desc" },
      });

      const agg = new Map(); // family -> {cadru, teava, mecanism, fixare, total}
      for (const j of jobs) {
        const dt = j.createdAt;
        if (isWeek && !inISOWeek(dt, year, week)) continue;

        const name = j.family?.name || "(fără)";
        if (!agg.has(name)) agg.set(name, { cadru: 0, teava: 0, mecanism: 0, fixare: 0, total: 0 });
        const r = agg.get(name);
        r.cadru += j.cadru;
        r.teava += j.teava;
        r.mecanism += j.mecanism;
        r.fixare += j.fixare;
        r.total += j.cadru + j.teava + j.mecanism + j.fixare;
      }

      let rows = [...agg.entries()].map(([family, v]) => ({ family, ...v }));
      if (q) {
        const qq = String(q).toLowerCase();
        rows = rows.filter(r => r.family.toLowerCase().includes(qq));
      }
      rows.sort((a, b) => b.total - a.total);
      res.json(rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "eroare server" });
    }
  }
);

// Tabele All (listări complete + delete)
app.get(
  "/admin/all",
  auth(),
  requireRole(Role.ADMIN, Role.HEAD_OPERATOR, Role.AUDIT),
  async (req, res) => {
    try {
      const { type, year, week, period, user, cnp, family } = req.query || {};
      const isWeek = (period || "week") === "week" && year && week;

      if (type === "taxe") {
        let list = await prisma.taxEntry.findMany({
          include: { user: true, family: true },
          orderBy: { createdAt: "desc" },
        });
        list = list.filter(r => {
          if (isWeek && !inISOWeek(r.createdAt, year, week)) return false;
          if (user && !(r.user?.username || "").toLowerCase().includes(String(user).toLowerCase())) return false;
          if (cnp && !(r.cnp || "").includes(String(cnp))) return false;
          if (family && !(r.family?.name || "").toLowerCase().includes(String(family).toLowerCase())) return false;
          return true;
        });
        return res.json(list.map(r => ({
          id: r.id,
          cnp: r.cnp,
          payment: r.payment,
          amount: r.amount,
          user: r.user?.username || null,
          family: r.family?.name || null,
          createdAt: r.createdAt,
        })));
      } else {
        let list = await prisma.drillJob.findMany({
          include: { user: true, family: true },
          orderBy: { createdAt: "desc" },
        });
        list = list.filter(r => {
          if (isWeek && !inISOWeek(r.createdAt, year, week)) return false;
          if (user && !(r.user?.username || "").toLowerCase().includes(String(user).toLowerCase())) return false;
          if (cnp && !(r.cnp || "").includes(String(cnp))) return false;
          if (family && !(r.family?.name || "").toLowerCase().includes(String(family).toLowerCase())) return false;
          return true;
        });
        return res.json(list.map(j => ({
          id: j.id,
          cnp: j.cnp,
          cadru: j.cadru,
          teava: j.teava,
          mecanism: j.mecanism,
          fixare: j.fixare,
          user: j.user?.username || null,
          family: j.family?.name || null,
          createdAt: j.createdAt,
        })));
      }
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "eroare server" });
    }
  }
);

app.delete(
  "/admin/taxe/:id",
  auth(),
  requireRole(Role.ADMIN, Role.HEAD_OPERATOR),
  forbidAudit,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      await prisma.taxEntry.delete({ where: { id } });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "nu am putut șterge" });
    }
  }
);

app.delete(
  "/admin/drill/:id",
  auth(),
  requireRole(Role.ADMIN, Role.HEAD_OPERATOR),
  forbidAudit,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      await prisma.drillJob.delete({ where: { id } });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "nu am putut șterge" });
    }
  }
);

// ---------- MY PROFILE ----------
app.get("/me/profile", auth(), async (req, res) => {
  try {
    const { year, week } = req.query || {};
    const isWeek = year && week;

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: "user" });

    const taxe = await prisma.taxEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    const drill = await prisma.drillJob.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    const daily = Array.from({ length: 7 }, () => ({ taxe: 0, clean: 0, dirty: 0 }));

    let cleanSum = 0, dirtySum = 0;

    for (const t of taxe) {
      const dt = t.createdAt;
      if (isWeek && !inISOWeek(dt, year, week)) continue;
      const wd = (dt.getDay() + 6) % 7;
      if (t.payment !== "GRATIS" && t.amount > 0) {
        if (t.currency === "CLEAN") { cleanSum += t.amount; daily[wd].clean += t.amount; }
        else { dirtySum += t.amount; daily[wd].dirty += t.amount; }
      }
      if (t.type === "TAXA") daily[wd].taxe += 1;
    }

    let pieces = 0, drillMoney = 0;
    for (const j of drill) {
      const dt = j.createdAt;
      if (isWeek && !inISOWeek(dt, year, week)) continue;
      const totalPieces = j.cadru + j.teava + j.mecanism + j.fixare;
      pieces += totalPieces;
      drillMoney += totalPieces * j.unitPrice; // 0 dacă e GRATIS
    }
    dirtySum += drillMoney; // burghiu e Bani murdari

    // split 50/50
    const split = {
      cleanUser: Math.round(cleanSum * 0.5),
      cleanFamily: cleanSum - Math.round(cleanSum * 0.5),
      dirtyUser: Math.round(dirtySum * 0.5),
      dirtyFamily: dirtySum - Math.round(dirtySum * 0.5),
    };
    split.userShare = split.cleanUser + split.dirtyUser;
    split.familyShare = split.cleanFamily + split.dirtyFamily;
    split.total = cleanSum + dirtySum;

    res.json({
      daily,
      cleanSum,
      dirtySum,
      drill: { pieces, money: drillMoney },
      split,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare" });
  }
});

// ---------- START ----------
(async () => {
  await ensureFamilies();
  await bootstrapAdminInvite();
  app.listen(PORT, HOST, () =>
    console.log(`Listening on http://${HOST}:${PORT}`)
  );
})();
