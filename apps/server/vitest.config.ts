import { existsSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

if (existsSync('.env')) process.loadEnvFile('.env')

export default defineConfig({
  test: {
    globalSetup: ['test/globalSetup.ts'],
    // Tests wipe tables, so they always run against TEST_DATABASE_URL (validated in globalSetup).
    env: { NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL ?? '' },
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
