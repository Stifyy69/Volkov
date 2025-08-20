// backend/server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import routes from "./routes/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 8081;
const HOST = "0.0.0.0";
const FRONT_ORIGIN = process.env.FRONT_ORIGIN || "*";

/* ----------------------------- Core / Proxy ------------------------------ */
app.set("trust proxy", true);

/* ----------------------------- Body & CORS ------------------------------- */
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", FRONT_ORIGIN);
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,OPTIONS"
  );
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

/* -------------------------------- Static -------------------------------- */
app.use(express.static(path.join(__dirname, "../public")));
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

/* ------------------------------- Health --------------------------------- */
app.get("/health", (_req, res) => res.json({ ok: true }));

/* ------------------------------- Routes --------------------------------- */
app.use("/", routes);

/* ------------------------- Not Found (API only) -------------------------- */
app.use((req, res, next) => {
  // dacă cere un fișier din public și nu există, lasă 404-ul să treacă
  if (req.method === "GET" && req.accepts("html")) {
    // pentru rute front-end (SPA) întoarce index.html
    return res.sendFile(path.join(__dirname, "../public/index.html"));
  }
  next();
});

/* ---------------------------- Error Handler ------------------------------ */
app.use((err, _req, res, _next) => {
  console.error("Server error:", err);
  res.status(err.status || 500).json({
    error: err.message || "eroare server",
  });
});

/* --------------------------------- Start -------------------------------- */
app.listen(PORT, HOST, () => {
  console.log(`Listening on http://${HOST}:${PORT}`);
});

export default app;
