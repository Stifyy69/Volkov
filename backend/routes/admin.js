// backend/routes/admin.js
import express from "express";
import prisma from "../db.js";
import { auth, requireRole } from "../utils.js";
import { Role } from "@prisma/client";

const router = express.Router();

/* ------------------------------ Invite codes ------------------------------- */
router.post(
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

router.get(
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

/* ---------------------------- Delete any entry ----------------------------- */
router.delete(
  "/entry/:id",
  auth(),
  requireRole(Role.ADMIN, Role.HEAD_OPERATOR),
  async (req, res) => {
    try {
      const id = req.params.id;
      // ștergem fie din taxe, fie din drill
      const deletedTax = await prisma.taxEntry.deleteMany({ where: { id } });
      if (deletedTax.count > 0) return res.json({ ok: true, type: "tax" });

      const deletedDrill = await prisma.drillJob.deleteMany({ where: { id } });
      if (deletedDrill.count > 0) return res.json({ ok: true, type: "drill" });

      res.status(404).json({ error: "entry not found" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "eroare server" });
    }
  }
);

export default router;
