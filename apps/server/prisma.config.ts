import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

if (existsSync('.env')) process.loadEnvFile('.env')

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection; fall back to DATABASE_URL elsewhere.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
})
