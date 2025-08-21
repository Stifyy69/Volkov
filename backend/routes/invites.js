// backend/routes/invites.js
import { Router } from "express";
import prisma from "../db.js";
import { auth, requireRole } from "../utils.js";
import { Role } from "@prisma/client";

const router = Router();

// POST /invites
router.post("/", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR), async (req, res) => {
  try {
    const { role } = req.body || {};
    const r = role && Object.values(Role).includes(role) ? role : Role.OPERATOR;
    const code = Math.random().toString(36).slice(2, 10).toUpperCase();
    const inv = await prisma.invite.create({
      data: { code, role: r, createdById: req.user.id },
    });
    res.json({ code: inv.code, role: inv.role });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

// GET /invites
router.get("/", auth(), requireRole(Role.ADMIN, Role.HEAD_OPERATOR), async (_req, res) => {
  try {
    const list = await prisma.invite.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
