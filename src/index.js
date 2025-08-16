import express from "express";
import { PrismaClient } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 8081;

app.use(express.json());

/**
 * HEALTH CHECK
 */
app.get("/health", (req, res) => res.json({ ok: true }));

/**
 * POST /taxe - salvează CNP + metoda de plată
 */
app.post("/taxe", async (req, res) => {
  try {
    const { cnp, metoda } = req.body;
    if (!cnp || cnp.length > 6) {
      return res.status(400).json({ error: "CNP invalid (max 6 caractere)" });
    }

    // setăm resursele în funcție de metoda selectată
    let baniCurati = 0;
    let baniMurdari = 0;
    let otel = 0;
    let prafPusca = 0;

    if (metoda === "Bani Curati") baniCurati = 40000;
    if (metoda === "Bani Murdari") baniMurdari = 60000;
    if (metoda === "Otel") otel = 15;
    if (metoda === "Praf de pusca") prafPusca = 25;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 ore

    const taxa = await prisma.taxa.create({
      data: { cnp, metoda, baniCurati, baniMurdari, otel, prafPusca, expiresAt }
    });

    res.json(taxa);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Eroare server" });
  }
});

/**
 * GET /taxe - listează CNP-urile active (neexpirate)
 */
app.get("/taxe", async (req, res) => {
  try {
    const now = new Date();
    const taxe = await prisma.taxa.findMany({
      where: { expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" }
    });

    // calculăm timpul rămas
    const withTimeLeft = taxe.map(t => {
      const diff = t.expiresAt.getTime() - now.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      return { ...t, timeLeft: `${hours}h ${minutes}m` };
    });

    res.json(withTimeLeft);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Eroare server" });
  }
});

/**
 * POST /burghiu - salvează acțiune și familie
 */
app.post("/burghiu", async (req, res) => {
  try {
    const { cnp, actiune, familie } = req.body;
    if (!cnp || cnp.length > 6) {
      return res.status(400).json({ error: "CNP invalid (max 6 caractere)" });
    }
    if (!actiune || !familie) {
      return res.status(400).json({ error: "Actiune si familie obligatorii" });
    }

    const burghiu = await prisma.burghiu.create({
      data: { cnp, actiune, familie }
    });

    res.json(burghiu);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Eroare server" });
  }
});

/**
 * GET /burghiu - listează tot ce s-a băgat
 */
app.get("/burghiu", async (req, res) => {
  try {
    const list = await prisma.burghiu.findMany({ orderBy: { createdAt: "desc" } });
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Eroare server" });
  }
});

app.listen(PORT, () => console.log("Listening on :" + PORT));
