import pkg from "@prisma/client";
const { PrismaClient, Role } = pkg;
const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password: "admin",
      role: "ADMIN"
    }
  });
  console.log("Seeded admin:", admin.username);
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
