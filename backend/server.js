// backend/server.js
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.js";
import taxeRoutes from "./routes/taxe.js";
import drillRoutes from "./routes/drill.js";
import statsRoutes from "./routes/stats.js";
import adminRoutes from "./routes/admin.js";
import profileRoutes from "./routes/profile.js";
import prisma from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8081;
const HOST = "0.0.0.0";
const FRONT_ORIGIN = process.env.FRONT_ORIGIN || "*";

app.use(express.json());
app.use(cors({ origin: FRONT_ORIGIN }));

// static files
app.use(express.static(path.join(__dirname, "../public")));
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// health
app.get("/health", (_req, res) => res.json({ ok: true }));

// routes
app.use("/auth", authRoutes);
app.use("/taxe", taxeRoutes);
app.use("/drill", drillRoutes);
app.use("/stats", statsRoutes);
app.use("/admin", adminRoutes);
app.use("/profile", profileRoutes);

// start
(async () => {
  app.listen(PORT, HOST, () =>
    console.log(`Listening on http://${HOST}:${PORT}`)
  );
})();
