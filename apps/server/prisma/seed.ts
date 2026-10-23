import { prisma } from '../src/config/database.js'
import { hashPassword } from '../src/utils/password.js'

const DEPARTMENTS = [
  { name: 'General Support', description: 'General questions and help' },
  { name: 'Technical Support', description: 'Bugs, errors and technical issues' },
  { name: 'Billing', description: 'Invoices, payments and refunds' },
  { name: 'Sales', description: 'Pricing, plans and purchasing' },
]

async function main(): Promise<void> {
  for (const dept of DEPARTMENTS) {
    await prisma.department.upsert({ where: { name: dept.name }, update: {}, create: dept })
  }
  console.log(`Departments: ${DEPARTMENTS.map((d) => d.name).join(', ')}`)

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD
  if (!email || !password) {
    console.log('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set; skipping admin account')
    return
  }
  if (password.length < 8) throw new Error('SEED_ADMIN_PASSWORD must be at least 8 characters')

  // Never overwrites an existing account's password or role.
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`Admin ${email} already exists (role: ${existing.role}); left unchanged`)
    return
  }
  await prisma.user.create({
    data: { name: 'Administrator', email, passwordHash: await hashPassword(password), role: 'ADMIN' },
  })
  console.log(`Created admin ${email}`)
}

main()
  .catch((err: unknown) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
