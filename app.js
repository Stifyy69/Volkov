// app.js
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();
const app = express();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public")); // servește index/styles/app.js din /public

// ---------- Utils: ISO Week ----------
function mondayOfISOWeek(year, week) {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay() || 7;
  const start = new Date(simple);
  if (dow <= 4) start.setUTCDate(simple.getUTCDate() - dow + 1);
  else start.setUTCDate(simple.getUTCDate() + 8 - dow);
  return start;
}
function rangeFromQuery(q) {
  // Acceptă ?period=all | ?year&week (ISO)
  if (q.period === "all") return { from: null, to: null };
  const year = q.year ? parseInt(q.year) : null;
  const week = q.week ? parseInt(q.week) : null;
  if (!year || !week) return { from: null, to: null };
  const from = mondayOfISOWeek(year, week);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 7);
  return { from, to };
}
function isGratisFamily(name = "") {
  const s = (name || "").toLowerCase();
  return s.includes("818") || s.includes("medelin") || s.includes("stefanos");
}
function fmtRemaining(validUntil) {
  if (!validUntil) return "";
  const ms = new Date(validUntil).getTime() - Date.now();
  if (ms <= 0) return "expirat";
  const m = Math.floor(ms / 60000);
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

// ---------- SSE (live) ----------
const sseClients = new Set();
function sseBroadcast(event, data = {}) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch {}
  }
}
app.get("/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  res.write("event: ping\ndata: {}\n\n");
  sseClients.add(res);
  const iv = setInterval(() => res.write("event: ping\ndata: {}\n\n"), 20000);
  req.on("close", () => {
    clearInterval(iv);
    sseClients.delete(res);
  });
});

// ---------- Auth ----------
function sign(user) {
  return jwt.sign({ id: user.id, role: user.role, username: user.username }, JWT_SECRET, {
    expiresIn: "7d",
  });
}
function auth(required = true) {
  return (req, res, next) => {
    const h = req.headers.authorization || "";
    const tok = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (!tok) {
      if (required) return res.status(401).json({ error: "Unauthenticated" });
      req.user = null;
      return next();
    }
    try {
      req.user = jwt.verify(tok, JWT_SECRET);
      return next();
    } catch {
      if (required) return res.status(401).json({ error: "Invalid token" });
      req.user = null;
      return next();
    }
  };
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

// Register (cu invite)
app.post("/auth/register", async (req, res) => {
  try {
    const { inviteCode, username, nickname, password, cnp } = req.body || {};
    if (!inviteCode || !username || !password) {
      return res.status(400).json({ error: "Lipsește invite/username/password" });
    }

    const inv = await prisma.invite.findUnique({ where: { code: inviteCode } });
    if (!inv || inv.usedAt) return res.status(400).json({ error: "Invite invalid/folosit" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        password: hashed,
        nickname: nickname || null,
        cnp: cnp || null,
        role: inv.role,
      },
    });

    await prisma.invite.update({
      where: { id: inv.id },
      data: { usedAt: new Date(), usedById: user.id },
    });

    return res.json({ token: sign(user) });
  } catch (e) {
    return res.status(500).json({ error: "Register error" });
  }
});

// Login
app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(400).json({ error: "User sau parolă greșită" });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "User sau parolă greșită" });
    res.json({ token: sign(user) });
  } catch {
    res.status(500).json({ error: "Login error" });
  }
});

// Me
app.get("/auth/me", auth(), async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.user.id } });
  res.json({ id: u.id, username: u.username, role: u.role });
});

// Invites
app.post("/invites", auth(), requireRole("ADMIN", "HEAD_OPERATOR", "AUDIT"), async (req, res) => {
  try {
    const { role = "OPERATOR" } = req.body || {};
    const code = crypto.randomBytes(6).toString("hex");
    const inv = await prisma.invite.create({
      data: { code, role, createdById: req.user.id },
    });
    res.json({ code, link: `invite:${code}` });
  } catch {
    res.status(500).json({ error: "Nu am putut genera invitația" });
  }
});

// ---------- Families helper ----------
async function getOrCreateFamilyByName(name) {
  if (!name) return null;
  try {
    return await prisma.family.upsert({
      where: { name },
      update: {},
      create: { name, colorHex: "#888888" },
    });
  } catch {
    return await prisma.family.findUnique({ where: { name } });
  }
}

// ---------- TAXE ----------
/**
 * POST /taxe
 * body: { cnp, metoda: "curat"|"murdar"|"gratis", gratisFamilie? }
 * Creează o intrare TaxEntry cu validUntil = now + 4h (active).
 * NU permite 2 taxe ACTIVE simultane pe același CNP.
 * Murdar = 50.000$ (actualizat conform cerinței).
 */
app.post("/taxe", auth(), async (req, res) => {
  try {
    const { cnp, metoda, gratisFamilie } = req.body || {};
    if (!cnp || !/^\d{1,6}$/.test(cnp)) return res.status(400).json({ error: "CNP invalid" });
    if (!["curat", "murdar", "gratis"].includes(metoda))
      return res.status(400).json({ error: "Metodă invalidă" });

    // Blochează duplicate ACTIVE pe același CNP
    const active = await prisma.taxEntry.findFirst({
      where: { type: "TAXA", cnp, validUntil: { gt: new Date() } },
      select: { id: true },
    });
    if (active) return res.status(400).json({ error: "Există deja o taxă activă pentru acest CNP." });

    let amount = 0;
    let currency = null;
    let familyId = null;
    let payment = null;

    if (metoda === "curat") {
      amount = 40000;
      currency = "CLEAN";
    } else if (metoda === "murdar") {
      amount = 50000; // <- 50.000$ aici
      currency = "DIRTY";
    } else {
      amount = 0;
      currency = "CLEAN";
      payment = "GRATIS";
      if (!gratisFamilie) return res.status(400).json({ error: "Alege familia pentru GRATIS" });
      const fam = await getOrCreateFamilyByName(gratisFamilie);
      familyId = fam?.id || null;
    }

    const validUntil = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4h active
    const row = await prisma.taxEntry.create({
      data: {
        type: "TAXA",
        currency,
        amount,
        validUntil,
        cnp,
        payment,
        userId: req.user?.id || null,
        familyId,
      },
      include: { user: true, family: true },
    });

    sseBroadcast("taxe:new", { id: row.id });
    res.json({
      id: row.id,
      cnp: row.cnp,
      tip: amount === 0 ? "GRATIS" : amount === 40000 ? "Bani curați" : "Bani murdari",
      remaining: fmtRemaining(row.validUntil),
      user: row.user?.username || null,
      gratisFamilie: row.family?.name || null,
      createdAt: row.createdAt,
    });
  } catch (e) {
    res.status(500).json({ error: "Eroare la creare taxă" });
  }
});

/**
 * GET /taxe
 * Query:
 *  - scope=active|history (default: active)
 *  - period=all | (year, week)
 *  - mine=1
 * history: filtre DOAR pe createdAt (include active + inactive)
 */
app.get("/taxe", auth(false), async (req, res) => {
  try {
    const scope = req.query.scope || "active";
    const mine = req.query.mine === "1";
    const { from, to } = rangeFromQuery(req.query);

    const where = {
      type: "TAXA",
      ...(scope === "active"
        ? { validUntil: { gt: new Date() } }
        : {}), // pentru history NU filtrăm pe validUntil
      ...(from && to ? { createdAt: { gte: from, lt: to } } : {}),
      ...(mine && req.user ? { userId: req.user.id } : {}),
    };

    const rows = await prisma.taxEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: true, family: true },
    });

    const data = rows.map((r) => ({
      id: r.id,
      cnp: r.cnp,
      tip: r.amount === 0 ? "GRATIS" : r.amount === 40000 ? "Bani curați" : "Bani murdari",
      remaining: r.validUntil ? fmtRemaining(r.validUntil) : "",
      user: r.user?.username || null,
      createdAt: r.createdAt,
      gratisFamilie: r.family?.name || null,
      metoda: r.payment === "GRATIS" ? "gratis" : r.amount === 40000 ? "curat" : "murdar",
    }));

    res.json(data);
  } catch {
    res.status(500).json({ error: "Eroare la listare taxe" });
  }
});

// DELETE /taxe/:id (ADMIN/HEAD_OPERATOR)
app.delete(
  "/taxe/:id",
  auth(),
  requireRole("ADMIN", "HEAD_OPERATOR"),
  async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await prisma.taxEntry.delete({ where: { id } });
      sseBroadcast("taxe:new", { id });
      res.json({ ok: true });
    } catch {
      res.status(400).json({ error: "Nu s-a putut șterge taxa" });
    }
  }
);

// ---------- BURGHIU ----------
/**
 * POST /drill
 * Acceptă:
 *  - format vechi: { cnp, part: "cadru|teava|mecanism|fixare", quantity, family }
 *  - format agregat: { cnp, family, cadru?, teava?, mecanism?, fixare? }
 *
 * Serverul încearcă să aglutineze în ACELAȘI RÂND dacă există deja
 * o înregistrare compatibilă (același user, cnp, familie, cashType, unitPrice)
 * creată în ultimele 10 minute.
 */
app.post("/drill", auth(), async (req, res) => {
  try {
    const { cnp, part, quantity, family } = req.body || {};
    if (!cnp || !/^\d{1,6}$/.test(cnp)) return res.status(400).json({ error: "CNP invalid" });
    if (!family) return res.status(400).json({ error: "Familie lipsă" });

    // Construieste cantitățile finale din payload (suportă ambele formate)
    const parts = { cadru: 0, teava: 0, mecanism: 0, fixare: 0 };

    // format vechi
    if (part) {
      if (!["cadru", "teava", "mecanism", "fixare"].includes(part))
        return res.status(400).json({ error: "Piesă invalidă" });
      const q = parseInt(quantity || 0);
      if (q <= 0) return res.status(400).json({ error: "Cantitate > 0" });
      parts[part] = q;
    }

    // format agregat
    ["cadru", "teava", "mecanism", "fixare"].forEach((k) => {
      if (req.body[k] != null) {
        const v = parseInt(req.body[k] || 0);
        if (v > 0) parts[k] += v;
      }
    });

    const totalIncoming =
      parts.cadru + parts.teava + parts.mecanism + parts.fixare;
    if (totalIncoming <= 0) return res.status(400).json({ error: "Cantitate totală 0" });

    // determină familie + policy de preț
    const fam = await getOrCreateFamilyByName(family);
    const gratis = isGratisFamily(fam?.name || "");
    const cashType = gratis ? "CLEAN" : "DIRTY";
    const unitPrice = gratis ? 0 : 1000;

    // caută un rând existent recent (10 minute)
    const since = new Date(Date.now() - 10 * 60 * 1000);
    const existing = await prisma.drillJob.findFirst({
      where: {
        userId: req.user.id,
        cnp,
        familyId: fam?.id || null,
        cashType,
        unitPrice,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
    });

    let row;
    if (existing) {
      // UPDATE: adună cantitățile
      row = await prisma.drillJob.update({
        where: { id: existing.id },
        data: {
          processed: existing.processed + totalIncoming,
          cadru: existing.cadru + parts.cadru,
          teava: existing.teava + parts.teava,
          mecanism: existing.mecanism + parts.mecanism,
          fixare: existing.fixare + parts.fixare,
        },
        include: { user: true, family: true },
      });
    } else {
      // CREATE: un singur rând cu tot
      row = await prisma.drillJob.create({
        data: {
          cnp,
          processed: totalIncoming,
          cashType,
          unitPrice,
          createdAt: new Date(),
          userId: req.user.id,
          familyId: fam?.id || null,
          cadru: parts.cadru,
          teava: parts.teava,
          mecanism: parts.mecanism,
          fixare: parts.fixare,
        },
        include: { user: true, family: true },
      });
    }

    sseBroadcast("drill:new", { id: row.id });
    res.json({
      id: row.id,
      cnp: row.cnp,
      family: row.family?.name || null,
      cadru: row.cadru,
      teava: row.teava,
      mecanism: row.mecanism,
      fixare: row.fixare,
      metodaPlata: unitPrice === 0 ? "GRATIS" : "Bani murdari",
      costTotal: (row.cadru + row.teava + row.mecanism + row.fixare) * row.unitPrice,
      user: row.user?.username || null,
      createdAt: row.createdAt,
    });
  } catch (e) {
    res.status(500).json({ error: "Eroare la burghiu" });
  }
});

/**
 * GET /drill
 * Query: mine=1, period=all | year&week
 */
app.get("/drill", auth(false), async (req, res) => {
  try {
    const mine = req.query.mine === "1";
    const { from, to } = rangeFromQuery(req.query);

    const where = {
      ...(from && to ? { createdAt: { gte: from, lt: to } } : {}),
      ...(mine && req.user ? { userId: req.user.id } : {}),
    };

    const rows = await prisma.drillJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: true, family: true },
    });

    const data = rows.map((r) => ({
      id: r.id,
      cnp: r.cnp,
      family: r.family?.name || null,
      cadru: r.cadru,
      teava: r.teava,
      mecanism: r.mecanism,
      fixare: r.fixare,
      metodaPlata: r.unitPrice === 0 ? "GRATIS" : r.cashType === "CLEAN" ? "Bani curați" : "Bani murdari",
      costTotal: (r.cadru + r.teava + r.mecanism + r.fixare) * r.unitPrice,
      user: r.user?.username || null,
      createdAt: r.createdAt,
    }));

    res.json(data);
  } catch {
    res.status(500).json({ error: "Eroare la listare burghiu" });
  }
});

// DELETE /drill/:id (ADMIN/HEAD_OPERATOR)
app.delete(
  "/drill/:id",
  auth(),
  requireRole("ADMIN", "HEAD_OPERATOR"),
  async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await prisma.drillJob.delete({ where: { id } });
      sseBroadcast("drill:new", { id });
      res.json({ ok: true });
    } catch {
      res.status(400).json({ error: "Nu s-a putut șterge jobul" });
    }
  }
);

// ---------- Admin: split / stats ----------
/**
 * GET /admin/stats
 * Query: period=all | year&week
 * Return pe user:
 *  - userShareClean / userShareDirty
 *  - familyShareClean / familyShareDirty
 *  - totalClean / totalDirty / total
 *  (split 50/50, ca în UI)
 *  Murdar per taxă = 50.000$ (actualizat).
 */
app.get(
  "/admin/stats",
  auth(),
  requireRole("ADMIN", "HEAD_OPERATOR", "AUDIT"),
  async (req, res) => {
    try {
      const { from, to } = rangeFromQuery(req.query);
      const timeWhere = from && to ? { createdAt: { gte: from, lt: to } } : {};

      // Taxe -> DOAR createdAt în range (active + inactive)
      const taxe = await prisma.taxEntry.findMany({
        where: { type: "TAXA", ...timeWhere },
        include: { user: true },
      });

      const map = new Map();
      function accUser(u, k, v) {
        const key = u?.username || "-";
        const row = map.get(key) || {
          username: key,
          userShareClean: 0,
          userShareDirty: 0,
          familyShareClean: 0,
          familyShareDirty: 0,
          totalClean: 0,
          totalDirty: 0,
          total: 0,
        };
        row[k] += v;
        map.set(key, row);
      }

      for (const t of taxe) {
        if (t.amount === 40000) accUser(t.user, "totalClean", 40000);
        else if (t.amount === 50000) accUser(t.user, "totalDirty", 50000); // <- 50k
      }

      // Drill (murdar sau gratis=0)
      const drill = await prisma.drillJob.findMany({
        where: { ...timeWhere },
        include: { user: true },
      });
      for (const j of drill) {
        const total = (j.cadru + j.teava + j.mecanism + j.fixare) * j.unitPrice;
        accUser(j.user, "totalDirty", total);
      }

      // Split 50/50
      for (const [k, r] of map.entries()) {
        r.userShareClean = r.totalClean * 0.5;
        r.familyShareClean = r.totalClean * 0.5;
        r.userShareDirty = r.totalDirty * 0.5;
        r.familyShareDirty = r.totalDirty * 0.5;
        r.total = r.totalClean + r.totalDirty;
        map.set(k, r);
      }

      res.json([...map.values()].sort((a, b) => b.total - a.total));
    } catch {
      res.status(500).json({ error: "Eroare stats" });
    }
  }
);

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`Volkov API running on http://localhost:${PORT}`);
});
