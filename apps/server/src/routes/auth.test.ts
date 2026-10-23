import type { Request, Response } from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApi, createUser, resetDatabase, startServer } from '../../test/helpers.js'
import type { AppServer } from '../app.js'
import { prisma } from '../config/database.js'
import { authorize } from '../middleware/auth.js'
import type { PublicUser } from '../services/auth.service.js'
import { AppError } from '../utils/AppError.js'

let server: AppServer
let api: ReturnType<typeof createApi>

beforeAll(async () => {
  const started = await startServer()
  server = started.server
  api = createApi(started.url)
})
afterAll(async () => {
  await server.realtime.close()
})
beforeEach(resetDatabase)

const valid = { name: 'Ada Lovelace', email: 'Ada@Example.com', password: 'correct horse' }

describe('POST /api/auth/register', () => {
  it('creates a customer and returns a token without exposing the password hash', async () => {
    const { status, body } = await api('/auth/register', { body: valid })

    expect(status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.token).toEqual(expect.any(String))
    expect(body.data.user).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com', role: 'CUSTOMER' })
    expect(body.data.user).not.toHaveProperty('passwordHash')

    const stored = await prisma.user.findUnique({ where: { email: 'ada@example.com' }, omit: { passwordHash: false } })
    expect(stored?.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/)
  })

  it('ignores a client-supplied role', async () => {
    const { body } = await api('/auth/register', { body: { ...valid, role: 'ADMIN' } })
    expect(body.data.user.role).toBe('CUSTOMER')
  })

  it('rejects a duplicate email regardless of case', async () => {
    await api('/auth/register', { body: valid })
    const { status, body } = await api('/auth/register', { body: { ...valid, email: 'ADA@example.COM' } })
    expect(status).toBe(409)
    expect(body).toEqual({ success: false, message: expect.any(String), error: 'EMAIL_TAKEN' })
  })

  it('validates input', async () => {
    const { status, body } = await api('/auth/register', { body: { name: '', email: 'nope', password: 'short' } })
    expect(status).toBe(400)
    expect(body.error).toBe('VALIDATION_ERROR')
    expect(body.details.map((d: { path: string }) => d.path).sort()).toEqual(['email', 'name', 'password'])
  })

  it('rejects passwords longer than bcrypt can use', async () => {
    const { status } = await api('/auth/register', { body: { ...valid, password: 'é'.repeat(40) } })
    expect(status).toBe(400)
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await api('/auth/register', { body: valid })
  })

  it('returns a token for valid credentials', async () => {
    const { status, body } = await api('/auth/login', { body: { email: 'ADA@example.com', password: valid.password } })
    expect(status).toBe(200)
    expect(body.data.user.email).toBe('ada@example.com')
    expect(body.data.user).not.toHaveProperty('passwordHash')

    const me = await api('/auth/me', { token: body.data.token })
    expect(me.body.data.user.email).toBe('ada@example.com')
  })

  it('gives the same error for a wrong password and an unknown email', async () => {
    const wrongPassword = await api('/auth/login', { body: { email: valid.email, password: 'wrong password' } })
    const unknownEmail = await api('/auth/login', { body: { email: 'nobody@example.com', password: 'whatever1' } })
    expect(wrongPassword.status).toBe(401)
    expect(unknownEmail.status).toBe(401)
    expect(wrongPassword.body).toEqual(unknownEmail.body)
    expect(wrongPassword.body.error).toBe('INVALID_CREDENTIALS')
  })
})

describe('GET /api/auth/me', () => {
  it('requires a valid token', async () => {
    expect((await api('/auth/me')).status).toBe(401)
    expect((await api('/auth/me', { token: 'not-a-jwt' })).status).toBe(401)

    const { token } = await createUser()
    const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa')
    expect((await api('/auth/me', { token: tampered })).status).toBe(401)
  })

  it('rejects tokens of users that were disabled or deleted after login', async () => {
    const { user, token } = await createUser()
    expect((await api('/auth/me', { token })).status).toBe(200)

    await prisma.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } })
    const disabled = await api('/auth/me', { token })
    expect(disabled.status).toBe(403)
    expect(disabled.body.error).toBe('ACCOUNT_DISABLED')

    await prisma.user.delete({ where: { id: user.id } })
    expect((await api('/auth/me', { token })).status).toBe(401)
  })

  it('reads the role from the database, not the token', async () => {
    const { user, token } = await createUser()
    await prisma.user.update({ where: { id: user.id }, data: { role: 'AGENT' } })
    expect((await api('/auth/me', { token })).body.data.user.role).toBe('AGENT')
  })
})

describe('disabled accounts', () => {
  it('cannot log in', async () => {
    const { user } = await createUser({ status: 'DISABLED', password: 'password123' })
    const { status, body } = await api('/auth/login', { body: { email: user.email, password: 'password123' } })
    expect(status).toBe(403)
    expect(body.error).toBe('ACCOUNT_DISABLED')
  })
})

describe('error handling', () => {
  it('returns the standard error shape for malformed JSON and unknown routes', async () => {
    const malformed = await api('/auth/login', { rawBody: '{"email":' })
    expect(malformed.status).toBe(400)
    expect(malformed.body).toEqual({ success: false, message: expect.any(String), error: 'INVALID_JSON' })

    const missing = await api('/nope')
    expect(missing.status).toBe(404)
    expect(missing.body.error).toBe('ROUTE_NOT_FOUND')
  })
})

describe('authorize()', () => {
  const run = (role: PublicUser['role'] | undefined) => {
    const req = { user: role ? ({ role } as PublicUser) : undefined } as Request
    let called = false
    try {
      authorize('ADMIN', 'AGENT')(req, {} as Response, () => (called = true))
    } catch (err) {
      return (err as AppError).statusCode
    }
    return called ? 'next' : 'none'
  }

  it('allows listed roles and rejects others', () => {
    expect(run('ADMIN')).toBe('next')
    expect(run('AGENT')).toBe('next')
    expect(run('CUSTOMER')).toBe(403)
    expect(run(undefined)).toBe(401)
  })
})
