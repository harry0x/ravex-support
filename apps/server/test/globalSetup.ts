import { execFileSync } from 'node:child_process'

/** Refuses to run unless TEST_DATABASE_URL targets a dedicated, non-public schema, then migrates it. */
export default function setup(): void {
  const testUrl = process.env.TEST_DATABASE_URL
  if (!testUrl) throw new Error('TEST_DATABASE_URL is not set (see apps/server/.env.example)')

  const schema = new URL(testUrl).searchParams.get('schema')
  if (!schema || schema === 'public' || testUrl === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must use a dedicated schema, e.g. ?schema=test. Tests delete all data in it.')
  }

  execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
    env: { ...process.env, DIRECT_URL: testUrl },
    stdio: 'pipe',
  })
}
