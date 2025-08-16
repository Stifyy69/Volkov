import express from "express";
import { PrismaClient } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 8081;
const HOST = "0.0.0.0";

app.use(express.json());
app.use(express.static("public"));

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/taxe/clean",     (req, res) => res.json({ ok: true, action: "clean" }));
app.post("/taxe/dirty",     (req, res) => res.json({ ok: true, action: "dirty" }));
app.post("/taxe/check",     (req, res) => res.json({ ok: true, action: "check" }));
app.post("/taxe/materials", (req, res) => res.json({ ok: true, action: "materials" }));

app.listen(PORT, HOST, () => {
  console.log(`Listening on ${HOST}:${PORT}`);
});
