// backend/server.js
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient, Role } from "@prisma/client";
import routes from "./routes/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const prisma = new PrismaClient();

const PORT = process.env.PORT || 8081;
const HOST = "0.0.0.0";
const JWT_SECRET = process.env.JWT_SECRET || "change-me";
const FRONT_ORIGIN = process.env.FRONT_ORIGIN || "*";

/* ----------------------------- Middleware/CORS ----------------------------- */
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", FRONT_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

/* --------------------------------- Static --------------------------------- */
app.use(express.static(path.join(__dirname, "../public")));
app.get("/", (_req, res) =>
  res.sendFile(path.join(__dirname, "../public/index.html"))
);

/* --------------------------------- Health --------------------------------- */
app.get("/health", (_req, res) => res.json({ ok: true }));

/* --------------------------------- Routes --------------------------------- */
app.use("/", routes);

/* --------------------------------- Start ---------------------------------- */
(async () => {
  app.listen(PORT, HOST, () =>
    console.log(`Listening on http://${HOST}:${PORT}`)
  );
})();
