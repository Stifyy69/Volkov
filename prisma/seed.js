import pkg from '@prisma/client'
import bcrypt from 'bcryptjs'
const { PrismaClient } = pkg
const prisma = new PrismaClient()

async function main() {
  const fams = [
    { name: 'Medelin', colorHex: '#ff69b4' },
    { name: 'Hells Riders (818)', colorHex: '#ff0000' },
    { name: 'Stefanos Cartel', colorHex: '#40e0d0' }
  ]
  for (const f of fams) {
    await prisma.family.upsert({
      where: { name: f.name },
      update: { colorHex: f.colorHex },
      create: f
    })
  }

  if (process.env.SEED === 'true' || process.env.SEED === '1') {
    const pass = await bcrypt.hash('admin', 10)
    await prisma.user.upsert({
      where: { username: 'admin' },
      update: {},
      create: {
        username: 'admin',
        password: pass,
        nickname: 'Admin',
        role: 'ADMIN',
        cnp: '000000'
      }
    })
    console.log('Seeded admin/admin + families')
  } else {
    console.log('Seed skipped (SEED is false)')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
  .finally(async () => prisma.$disconnect())
