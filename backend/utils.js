import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import prisma from "./db.js";
import { isoWeekRange } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "change-me";

/* --- auth: atașează userul în req.user, altfel 401 --- */
export function auth(required = true) {
  return (req, res, next) => {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (!token) {
      if (required) return res.status(401).json({ error: "no token" });
      return next();
    }
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = payload; // { id, role, username }
      next();
    } catch {
      return res.status(401).json({ error: "invalid token" });
    }
  };
}

/* --- requireRole: permite acces doar pentru rolurile date --- */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "forbidden" });
    }
    next();
  };
}

/* --- parsează interogarea de perioadă: week vs all --- */
export function parsePeriodQuery(q) {
  const periodAll = q.period === "all";
  if (periodAll) return { periodAll, start: null, end: null };

  const year = q.year ? Number(q.year) : null;
  const week = q.week ? Number(q.week) : null;

  if (!year || !week) {
    // default: săptămâna curentă (ISO, UTC)
    const now = new Date();
    const iso = isoWeekNumber(now);
    const { start, end } = isoWeekRange(iso.year, iso.week);
    return { periodAll: false, start, end, year: iso.year, week: iso.week };
  }

  const { start, end } = isoWeekRange(year, week);
  return { periodAll: false, start, end, year, week };
}

/* --- helper: ISO week number pentru o dată --- */
export function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

/* --- helper: filtrează după interval dacă nu e all --- */
export function inRange(createdAt, start, end, periodAll) {
  if (periodAll) return true;
  const t = createdAt.getTime();
  return t >= start.getTime() && t < end.getTime();
}

/* --- exporturi utile şi pentru alte module --- */
export { prisma, Role };
