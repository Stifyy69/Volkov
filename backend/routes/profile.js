// backend/routes/profile.js
import { Router } from "express";
import prisma from "../db.js";
import { auth } from "../utils.js";

const router = Router();

// GET /profile
router.get("/", auth(), async (req, res) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, username: true, role: true, nickname: true, cnp: true },
    });
    if (!me) return res.status(404).json({ error: "user inexistent" });
    res.json(me);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

// PUT /profile
router.put("/", auth(), async (req, res) => {
  try {
    const { nickname, cnp } = req.body || {};
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { nickname, cnp },
      select: { id: true, username: true, role: true, nickname: true, cnp: true },
    });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "eroare server" });
  }
});

export default router;
