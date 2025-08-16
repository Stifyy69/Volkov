import express from "express";
import { PrismaClient } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();
app.use(express.json());

const PORT = process.env.PORT || 8081;

// Healthcheck
app.get("/health", (_, res) => res.json({ ok: true }));

// ➤ TAXE
app.post("/taxe", async (req, res) => {
  const { cnp, metoda, family } = req.body;

  let amount = 0;
  if (metoda === "CLEAN") amount = 40000;
  if (metoda === "DIRTY") amount = 60000;

  const entry = await prisma.taxEntry.create({
    data: {
      cnp,
      metoda,
      amount,
      family: metoda === "FREE" ? family : null,
      validUntil: new Date(Date.now() + 4 * 60 * 60 * 1000)
    }
  });

  res.json(entry);
});

app.get("/taxe", async (_, res) => {
  const now = new Date();
  const entries = await prisma.taxEntry.findMany({
    where: { validUntil: { gt: now } },
    orderBy: { createdAt: "desc" }
  });

  const result = entries.map(e => {
    const diffMs = new Date(e.validUntil) - now;
    const hours = Math.floor(diffMs / 1000 / 60 / 60);
    const minutes = Math.floor((diffMs / 1000 / 60) % 60);
    return { ...e, timeLeft: `${hours}h ${minutes}m` };
  });

  res.json(result);
});

// ➤ BURGHIU
app.post("/drill", async (req, res) => {
  const { cnp, part, family, quantity } = req.body;

  const job = await prisma.drillJob.create({
    data: { cnp, part, family, quantity }
  });

  res.json(job);
});

app.get("/drill", async (_, res) => {
  const jobs = await prisma.drillJob.findMany({
    orderBy: { createdAt: "desc" }
  });
  res.json(jobs);
});

app.listen(PORT, () =>
  console.log("✅ Backend UP pe portul " + PORT)
);
