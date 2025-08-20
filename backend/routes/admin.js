// backend/routes/admin.js
import express from "express";
import prisma from "../db.js";
import { auth, requireRole } from "../utils.js";
import { Role } from "@prisma/client";

const router = express.Router();

/* ----------------------------- Invites Admin ----------------------------- */
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

/* ----------------------------- Admin Delete ----------------------------- */
router.delete(
  "/entry/:id",
  auth(),
  requireRole(Role.ADMIN, Role.HEAD_OPERATOR),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: "id invalid" });

      // caută în ambele
      const tax = await prisma.taxEntry.findUnique({ where: { id } });
      const drill = await prisma.drillJob.findUnique({ where: { id } });

      if (tax) {
        await prisma.taxEntry.delete({ where: { id } });
        return res.json({ ok: true, deleted: "taxEntry" });
      }
      if (drill) {
        await prisma.drillJob.delete({ where: { id } });
        return res.json({ ok: true, deleted: "drillJob" });
      }

      res.status(404).json({ error: "intrare inexistentă" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "eroare server" });
    }
  }
);

export default router;
