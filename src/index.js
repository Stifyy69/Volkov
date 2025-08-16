import express from "express";
import { PrismaClient } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 8081;

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log("Listening on :" + PORT));
