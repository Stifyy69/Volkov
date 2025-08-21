// backend/db.js
import { PrismaClient } from "@prisma/client";

// Singleton Prisma (evită multiple conexiuni în hot‑reload)
const prisma = globalThis.__PRISMA__ || new PrismaClient();
if (!globalThis.__PRISMA__) globalThis.__PRISMA__ = prisma;

/** Intervalul [start, end) pentru o săptămână ISO (UTC) */
export function isoWeekRange(year, week) {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay() || 7; // 1..7 (luni..duminică)
  const start = new Date(simple);
  if (dow <= 4) start.setUTCDate(simple.getUTCDate() - dow + 1);
  else          start.setUTCDate(simple.getUTCDate() + 8 - dow);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { start, end };
}

export default prisma;
