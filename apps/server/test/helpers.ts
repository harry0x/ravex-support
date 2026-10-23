import type { AddressInfo } from 'node:net'
import { buildServer, type AppServer } from '../src/app.js'
import { prisma } from '../src/config/database.js'
import type { Role, UserStatus } from '../src/generated/prisma/client.js'
import { signAccessToken } from '../src/utils/jwt.js'
import { hashPassword } from '../src/utils/password.js'

const TABLES = ['reactions', 'message_reads', 'attachments', 'messages', 'conversations', 'departments', 'users']

/** Empties every table in the test schema in one round trip. */
export async function resetDatabase(): Promise<void> {
  const schema = new URL(process.env.DATABASE_URL ?? '').searchParams.get('schema')
  if (!schema || schema === 'public' || !/^\w+$/.test(schema)) throw new Error(`Refusing to reset schema "${schema}"`)
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((t) => `"${schema}"."${t}"`).join(', ')} CASCADE`)
}

export async function startServer(): Promise<{ server: AppServer; url: string }> {
  const server = buildServer({ clientUrl: 'http://localhost:5173' })
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve))
  return { server, url: `http://localhost:${(server.httpServer.address() as AddressInfo).port}` }
}

let counter = 0
export async function createUser(options: { name?: string; role?: Role; status?: UserStatus; password?: string } = {}) {
  counter += 1
  const user = await prisma.user.create({
    data: {
      name: options.name ?? `User ${counter}`,
      email: `user${counter}-${Date.now()}@test.local`,
      passwordHash: await hashPassword(options.password ?? 'password123'),
      role: options.role ?? 'CUSTOMER',
      status: options.status ?? 'ACTIVE',
    },
  })
  return { user, token: await signAccessToken(user.id) }
}

export interface ApiOptions {
  method?: string
  body?: unknown
  token?: string
  rawBody?: string
}

// Response bodies are asserted on structurally, so tests read them loosely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiBody = Record<string, any>

/** Small fetch wrapper for `${baseUrl}/api${path}` that returns status + parsed JSON. */
export function createApi(baseUrl: string) {
  return async (path: string, init: ApiOptions = {}): Promise<{ status: number; body: ApiBody }> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (init.token) headers.Authorization = `Bearer ${init.token}`
    const hasBody = init.body !== undefined || init.rawBody !== undefined
    const res = await fetch(`${baseUrl}/api${path}`, {
      method: init.method ?? (hasBody ? 'POST' : 'GET'),
      headers,
      body: init.rawBody ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    })
    return { status: res.status, body: (await res.json()) as ApiBody }
  }
}
