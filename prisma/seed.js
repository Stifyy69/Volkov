import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USER ?? "admin";
  const rawPass  = process.env.ADMIN_PASS ?? "admin";
  const nickname = process.env.ADMIN_NICKNAME ?? "Admin"; // <-- nou
  const hash = await bcrypt.hash(rawPass, 12);

  // creează sau actualizează admin
  await prisma.user.upsert({
    where: { username },
    update: { password: hash, role: Role.ADMIN, nickname },
    create: { username, password: hash, role: Role.ADMIN, nickname },
  });

  // categorii default
  const categories = [
    { name: "Chirie",     isFixed: true },
    { name: "Utilități",  isFixed: true },
    { name: "Internet",   isFixed: true },
    { name: "Telefon",    isFixed: true },
    { name: "Mâncare",    isFixed: false },
    { name: "Transport",  isFixed: false },
    { name: "Altele",     isFixed: false },
  ];

  await Promise.all(
    categories.map(c =>
      prisma.expenseCategory.upsert({
        where: { name: c.name },
        update: {},
        create: c,
      })
    )
  );

  // foaie pentru luna curentă
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  await prisma.monthlySheet.upsert({
    where: { year_month: { year, month } },
    update: {},
    create: { year, month },
  });

  console.log("Seed OK: admin + categorii + foaie lunară curentă");
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
