import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'
import { env } from './env.js'

function createAdapter(databaseUrl: string): PrismaPg {
  const url = new URL(databaseUrl)
  // node-postgres does not understand Prisma's `?schema=` parameter, so pass it to the adapter instead.
  const schema = url.searchParams.get('schema') ?? undefined
  url.searchParams.delete('schema')
  // pg currently treats `require` as `verify-full` but will weaken it to libpq semantics in v9.
  // Pin the strict behaviour explicitly (Neon serves valid certificates).
  if (url.searchParams.get('sslmode') === 'require') url.searchParams.set('sslmode', 'verify-full')
  return new PrismaPg({ connectionString: url.toString() }, { schema })
}

export const prisma = new PrismaClient({
  adapter: createAdapter(env.databaseUrl),
  // Never return password hashes unless a query explicitly opts in with `omit: { passwordHash: false }`.
  omit: { user: { passwordHash: true } },
  // Prisma's defaults (2s to start, 5s to finish an interactive transaction) are tight for a
  // remote serverless database such as Neon, where a cold start or lock wait adds latency.
  transactionOptions: { maxWait: 10_000, timeout: 15_000 },
})

/** The client or an interactive-transaction client, typed with our global `omit`. */
export type DbClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>
