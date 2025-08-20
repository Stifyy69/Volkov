import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient, Role } from "@prisma/client";

const router = express.Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || "change-me";

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, username: user.username },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

router.post("/auth/register", async (req, res) => {
  try {
    const { username, password, nickname, cnp, inviteCode, email } = req.body || {};
    if (!username || !password || !inviteCode) {
      return res.status(400).json({ error: "date lipsă" });
    }
    if (cnp && !/^\d{1,6}$/.test(cnp)) {
      return res.status(400).json({ error: "CNP invalid (max 6 cifre)" });
    }

    const invite = await prisma.invite.findUnique({ where: { code: inviteCode } });
    if (!invite || invite.usedAt) {
      return res.status(400).json({ error: "invitație invalidă/folosită" });
    }

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
        role: invite.role || Role.OPERATOR
      }
    });

    await prisma.invite.update({
      where: { id: invite.id },
      data: { usedAt: new Date(), usedById: user.id }
    });

    const token = signToken(user);
    res.json({ token, role: user.role, username: user.username });
  } catch (e) {
    res.status(500).json({ error: "eroare server" });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(400).json({ error: "credentiale invalide" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "credentiale invalide" });

    const token = signToken(user);
    res.json({ token, role: user.role, username: user.username });
  } catch {
    res.status(500).json({ error: "eroare server" });
  }
});

router.get("/auth/me", async (req, res) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "no token" });

    const payload = jwt.verify(token, JWT_SECRET);
    const me = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, username: true, role: true, nickname: true }
    });
    if (!me) return res.status(401).json({ error: "invalid token" });

    res.json(me);
  } catch {
    res.status(401).json({ error: "invalid token" });
  }
});

export default router;
