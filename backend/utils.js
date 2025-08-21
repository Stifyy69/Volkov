// backend/utils.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "change-me";

/** Middleware: extrage user din Bearer token; 401 dacă required și lipsește/invalid */
export function auth(required = true) {
  return (req, res, next) => {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;

    if (!token) {
      if (required) return res.status(401).json({ error: "no token" });
      return next();
    }
    try {
      const payload = jwt.verify(token, JWT_SECRET); // { id, role, username }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: "invalid token" });
    }
  };
}

/** Middleware util pt. protejare pe roluri */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "forbidden" });
    }
    next();
  };
}

/** ISO year/week pentru o dată (UTC) */
export function isoYearWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

/** Format bani „1.000.000$” (dacă îți trebuie pe backend) */
export function formatMoney(n = 0) {
  return `${(n || 0).toLocaleString("ro-RO")}$`;
}
