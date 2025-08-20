// backend/db.js
import { PrismaClient } from "@prisma/client";

const prisma = globalThis.__prisma || new PrismaClient();
if (!globalThis.__prisma) globalThis.__prisma = prisma;

export function isoWeekRange(year, week) {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay() || 7;
  const start = new Date(simple);
  if (dow <= 4) start.setUTCDate(simple.getUTCDate() - dow + 1);
  else start.setUTCDate(simple.getUTCDate() + 8 - dow);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { start, end };
}

export default prisma;
