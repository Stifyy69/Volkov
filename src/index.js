import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient, Role, TaxType, Currency, Material, CashType } from "@prisma/client";

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
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
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
  const countUsers = await prisma.user.count();
  const exists = await prisma.invite.findUnique({ where: { code } });
  if (countUsers === 0 && !exists) {
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
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: "forbidden" });
    next();
  };
}

app.get("/health", (req, res) => res.json({ ok: true }));

// ================= AUTH =================
app.post("/auth/register", async (req, res) => {
  try {
    const { username, password, nickname, cnp, inviteCode, email } = req.body || {};
    if (!username || !password || !inviteCode) return res.status(400).json({ error: "date lipsă" });
    if (cnp && !/^\d{1,6}$/.test(cnp)) return res.status(400).json({ error: "CNP invalid (max 6 cifre)" });

    const invite = await prisma.invite.findUnique({ where: { code: inviteCode } });
    if (!invite || invite.usedAt) return res.status(400).json({ error: "invitație invalidă/folosită" });

    const existsUser = await prisma.user.findUnique({ where: { username } });
    if (existsUser) return res.status(400).json({ error: "username ocupat" });

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        password: hash,
        nickname: nickname || username,
        cnp: cnp || null,
        email: email || null,
        role: invite.role
      }
    });

    await prisma.invite.update({
      where: { id: invite.id },
      data: { usedAt: new Date(), usedById: user.id }
    });

    const token = jwt.sign({ id: user.id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, role: user.role, username: user.username });
  } catch (e) {
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
    const token = jwt.sign({ id: user.id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, role: user.role, username: user.username });
  } catch {
    res.status(500).json({ error: "eroare server" });
  }
});

app.get("/auth/me", auth(), async (req, res) => {
  const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, username: true, role: true, nickname: true } });
  res.json(me);
});

// ================= INVITES =================
app.post("/invites", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR), async (req, res) => {
  const { role } = req.body || {};
  const r = role && Object.values(Role).includes(role) ? role : Role.OPERATOR;
  const code = Math.random().toString(36).slice(2, 10).toUpperCase();
  const inv = await prisma.invite.create({ data: { code, role: r, createdById: req.user.id } });
  res.json({ code: inv.code, role: inv.role, link: `${req.headers.origin || ""}/?invite=${inv.code}` });
});

app.get("/invites", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR), async (req, res) => {
  const list = await prisma.invite.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  res.json(list);
});

// ================= TAXE =================
// (rutele /taxe din versiunea ta — nemodificate)

// ================= DRILL =================
// (rutele /drill din versiunea ta — nemodificate)

app.get("/families", auth(false), async (req, res) => {
  const list = await prisma.family.findMany({ orderBy: { name: "asc" } });
  res.json(list);
});

(async () => {
  await ensureFamilies();
  await bootstrapAdminInvite();
  app.listen(PORT, HOST, () => console.log(`Listening on ${HOST}:${PORT}`));
})();
