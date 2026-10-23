import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApi, createUser, resetDatabase, startServer } from '../../test/helpers.js'
import type { AppServer } from '../app.js'
import { buildServer } from '../app.js'
import { prisma } from '../config/database.js'
import { createConversation } from '../services/conversation.service.js'
import { createMessage } from '../services/message.service.js'

let server: AppServer
let baseUrl: string
let api: ReturnType<typeof createApi>

beforeAll(async () => {
  const started = await startServer()
  server = started.server
  baseUrl = started.url
  api = createApi(started.url)
})
afterAll(async () => {
  await server.realtime.close()
})

type Session = Awaited<ReturnType<typeof createUser>>
let customer: Session
let agent: Session
let admin: Session

beforeEach(async () => {
  await resetDatabase()
  ;[customer, agent, admin] = await Promise.all([
    createUser({ name: 'Cathy Customer' }),
    createUser({ name: 'Andy Agent', role: 'AGENT' }),
    createUser({ name: 'Ada Admin', role: 'ADMIN' }),
  ])
})

describe('user management', () => {
  it('lists, filters and searches users (admins only)', async () => {
    expect((await api('/users', { token: agent.token })).status).toBe(403)
    expect((await api('/users', { token: customer.token })).status).toBe(403)

    const all = await api('/users', { token: admin.token })
    expect(all.body.data.total).toBe(3)
    expect(all.body.data.items[0]).not.toHaveProperty('passwordHash')
    expect(all.body.data.items[0]).toHaveProperty('presence')

    const agents = await api('/users?role=AGENT', { token: admin.token })
    expect(agents.body.data.items.map((u: { name: string }) => u.name)).toEqual(['Andy Agent'])
    const search = await api('/users?q=cathy', { token: admin.token })
    expect(search.body.data.items.map((u: { name: string }) => u.name)).toEqual(['Cathy Customer'])
  })

  it('lets admins create staff accounts that can log in', async () => {
    const res = await api('/users', {
      token: admin.token,
      body: { name: 'New Agent', email: 'New.Agent@example.com', password: 'password123', role: 'AGENT' },
    })
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ email: 'new.agent@example.com', role: 'AGENT' })

    const login = await api('/auth/login', { body: { email: 'new.agent@example.com', password: 'password123' } })
    expect(login.body.data.user.role).toBe('AGENT')

    const duplicate = await api('/users', { token: admin.token, body: { name: 'X', email: 'new.agent@example.com', password: 'password123', role: 'AGENT' } })
    expect(duplicate.status).toBe(409)
    expect((await api('/users', { token: agent.token, body: { name: 'X', email: 'x@example.com', password: 'password123', role: 'ADMIN' } })).status).toBe(403)
  })

  it('lets users view and rename only themselves, without changing role or status', async () => {
    expect((await api(`/users/${customer.user.id}`, { token: customer.token })).status).toBe(200)
    expect((await api(`/users/${agent.user.id}`, { token: customer.token })).status).toBe(404)

    const renamed = await api(`/users/${customer.user.id}`, { method: 'PATCH', token: customer.token, body: { name: 'Cat' } })
    expect(renamed.body.data.name).toBe('Cat')
    expect((await api(`/users/${customer.user.id}`, { method: 'PATCH', token: customer.token, body: { role: 'ADMIN' } })).status).toBe(403)
    expect((await api(`/users/${agent.user.id}`, { method: 'PATCH', token: customer.token, body: { name: 'x' } })).status).toBe(404)
  })

  it('lets admins change roles and disable users, but not themselves', async () => {
    const promoted = await api(`/users/${customer.user.id}`, { method: 'PATCH', token: admin.token, body: { role: 'AGENT' } })
    expect(promoted.body.data.role).toBe('AGENT')
    expect((await api(`/users/${admin.user.id}`, { method: 'PATCH', token: admin.token, body: { role: 'CUSTOMER' } })).status).toBe(403)
    expect((await api(`/users/${admin.user.id}`, { method: 'PATCH', token: admin.token, body: { status: 'DISABLED' } })).status).toBe(403)
  })

  it('returns a disabled agent’s open conversations to the queue', async () => {
    const conversation = await createConversation(customer.user, { subject: 'Help', message: 'please' })
    await api(`/conversations/${conversation.id}/assign`, { token: agent.token, body: {} })

    const res = await api(`/users/${agent.user.id}`, { method: 'PATCH', token: admin.token, body: { status: 'DISABLED' } })
    expect(res.body.data.status).toBe('DISABLED')
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).agentId).toBeNull()
    expect((await api('/auth/me', { token: agent.token })).status).toBe(403)
  })
})

describe('GET /api/agents', () => {
  it('lists active agents with workload and presence for staff only', async () => {
    const conversation = await createConversation(customer.user, { subject: 'Help', message: 'please' })
    await api(`/conversations/${conversation.id}/assign`, { token: agent.token, body: {} })
    await createUser({ name: 'Gone Agent', role: 'AGENT', status: 'DISABLED' })

    const res = await api('/agents', { token: admin.token })
    expect(res.body.data).toEqual([expect.objectContaining({ name: 'Andy Agent', openConversations: 1, presence: 'offline' })])
    expect((await api('/agents', { token: agent.token })).status).toBe(200)
    expect((await api('/agents', { token: customer.token })).status).toBe(403)
  })
})

describe('departments', () => {
  it('supports admin CRUD and keeps conversations when a department is deleted', async () => {
    const created = await api('/departments', { token: admin.token, body: { name: 'Billing', description: 'Money' } })
    expect(created.status).toBe(201)
    const id = created.body.data.id as string
    expect((await api('/departments', { token: admin.token, body: { name: 'Billing' } })).status).toBe(409)
    expect((await api('/departments', { token: agent.token, body: { name: 'Sales' } })).status).toBe(403)

    const updated = await api(`/departments/${id}`, { method: 'PATCH', token: admin.token, body: { isActive: false } })
    expect(updated.body.data.isActive).toBe(false)
    expect((await api('/departments', { token: customer.token })).body.data).toEqual([])

    await api(`/departments/${id}`, { method: 'PATCH', token: admin.token, body: { isActive: true } })
    const conversation = await createConversation(customer.user, { subject: 'Invoice', message: 'wrong', departmentId: id })
    expect((await api(`/departments/${id}`, { method: 'DELETE', token: admin.token })).status).toBe(200)
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).departmentId).toBeNull()
    expect((await api(`/departments/${id}`, { method: 'DELETE', token: admin.token })).status).toBe(404)
  })
})

describe('admin dashboard', () => {
  it('reports totals and 14-day series', async () => {
    const open = await createConversation(customer.user, { subject: 'A', message: 'one' })
    const closed = await createConversation(customer.user, { subject: 'B', message: 'two' })
    await prisma.conversation.update({ where: { id: closed.id }, data: { status: 'CLOSED' } })
    await api(`/conversations/${open.id}/assign`, { token: agent.token, body: {} })
    await createMessage(agent.user, open.id, { content: 'hi' })

    const res = await api('/admin/stats', { token: admin.token })
    expect(res.status).toBe(200)
    expect(res.body.data.totals).toEqual({
      customers: 1,
      agents: 1,
      onlineAgents: 0,
      openConversations: 1,
      pendingConversations: 0,
      closedConversations: 1,
      messagesToday: 3, // two opening messages + one reply; system messages excluded
    })
    expect(res.body.data.conversationsPerDay).toHaveLength(14)
    expect(res.body.data.conversationsPerDay.at(-1)).toEqual({ date: new Date().toISOString().slice(0, 10), count: 2 })
    expect(res.body.data.messagesPerDay.at(-1).count).toBe(3)

    expect((await api('/admin/stats', { token: agent.token })).status).toBe(403)
  })

  it('returns a recent activity feed', async () => {
    const conversation = await createConversation(customer.user, { subject: 'Login', message: 'broken' })
    await api(`/conversations/${conversation.id}/assign`, { token: agent.token, body: {} })
    const res = await api('/admin/activity', { token: admin.token })
    const texts = res.body.data.map((a: { text: string }) => a.text)
    expect(texts).toContain('Cathy Customer opened “Login”')
    expect(texts).toContain('Andy Agent joined the conversation (“Login”)')
    expect(texts).toContain('Andy Agent joined as agent')
  })
})

describe('search', () => {
  it('finds conversations by customer name, email, subject or message content within the caller’s scope', async () => {
    const other = await createUser({ name: 'Zed Zebra' })
    const printer = await createConversation(customer.user, { subject: 'Printer jam', message: 'paper stuck' })
    const billing = await createConversation(other.user, { subject: 'Invoice', message: 'charged twice for the subscription' })

    const ids = async (session: Session, q: string) =>
      (await api(`/conversations?q=${encodeURIComponent(q)}`, { token: session.token })).body.data.items.map((c: { id: string }) => c.id)

    expect(await ids(agent, 'PRINTER')).toEqual([printer.id])
    expect(await ids(agent, 'zebra')).toEqual([billing.id])
    expect(await ids(agent, other.user.email)).toEqual([billing.id])
    expect(await ids(agent, 'subscription')).toEqual([billing.id])
    // Customers only ever search their own conversations.
    expect(await ids(customer, 'subscription')).toEqual([])
  })
})

describe('security', () => {
  it('sets security headers and hides the framework', async () => {
    const res = await fetch(`${baseUrl}/health`)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-powered-by')).toBeNull()
    expect(res.headers.get('strict-transport-security')).toContain('max-age')
  })

  it('rate limits failed login attempts', async () => {
    const limited = buildServer({ clientUrl: 'http://localhost:5173', rateLimit: true })
    await new Promise<void>((resolve) => limited.httpServer.listen(0, resolve))
    try {
      const port = (limited.httpServer.address() as { port: number }).port
      const attempt = () =>
        fetch(`http://localhost:${port}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong' }),
        })
      const statuses: number[] = []
      for (let i = 0; i < 10; i++) statuses.push((await attempt()).status)
      expect(statuses.every((s) => s === 401)).toBe(true)
      const blocked = await attempt()
      expect(blocked.status).toBe(429)
      expect(await blocked.json()).toMatchObject({ success: false, error: 'RATE_LIMITED' })
    } finally {
      limited.httpServer.closeAllConnections()
      await limited.realtime.close()
    }
  })
})
