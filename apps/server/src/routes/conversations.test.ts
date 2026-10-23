import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApi, createUser, resetDatabase, startServer } from '../../test/helpers.js'
import type { AppServer } from '../app.js'
import { prisma } from '../config/database.js'

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

type Session = Awaited<ReturnType<typeof createUser>>
let customer: Session
let otherCustomer: Session
let agent: Session
let otherAgent: Session
let admin: Session

beforeEach(async () => {
  await resetDatabase()
  ;[customer, otherCustomer, agent, otherAgent, admin] = await Promise.all([
    createUser({ name: 'Cathy Customer' }),
    createUser({ name: 'Oscar Other' }),
    createUser({ name: 'Andy Agent', role: 'AGENT' }),
    createUser({ name: 'Olga Agent', role: 'AGENT' }),
    createUser({ name: 'Ada Admin', role: 'ADMIN' }),
  ])
})

async function openConversation(session: Session = customer, body: Record<string, unknown> = {}) {
  const res = await api('/conversations', {
    token: session.token,
    body: { subject: 'Cannot log in', message: 'Help, my login fails', ...body },
  })
  expect(res.status).toBe(201)
  return res.body.data as { id: string; [key: string]: unknown }
}

const accept = (id: string, session: Session = agent) => api(`/conversations/${id}/assign`, { token: session.token, body: {} })
const send = (id: string, session: Session, content = 'hello') =>
  api(`/conversations/${id}/messages`, { token: session.token, body: { content } })

describe('creating conversations', () => {
  it('creates the conversation with its first message', async () => {
    const department = await prisma.department.create({ data: { name: 'Billing' } })
    const conversation = await openConversation(customer, { departmentId: department.id })

    expect(conversation).toMatchObject({
      subject: 'Cannot log in',
      status: 'OPEN',
      priority: 'NORMAL',
      agent: null,
      customer: { id: customer.user.id, name: 'Cathy Customer' },
      department: { id: department.id, name: 'Billing' },
      lastMessage: { content: 'Help, my login fails', type: 'TEXT', senderId: customer.user.id },
    })
    expect(conversation.lastMessageAt).toEqual(expect.any(String))
  })

  it('only allows customers, and validates the department', async () => {
    const body = { subject: 'x', message: 'y' }
    expect((await api('/conversations', { token: agent.token, body })).status).toBe(403)
    expect((await api('/conversations', { token: admin.token, body })).status).toBe(403)
    expect((await api('/conversations', { body })).status).toBe(401)

    const inactive = await prisma.department.create({ data: { name: 'Old', isActive: false } })
    const res = await api('/conversations', { token: customer.token, body: { ...body, departmentId: inactive.id } })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INVALID_DEPARTMENT')
  })

  it('validates input', async () => {
    const res = await api('/conversations', { token: customer.token, body: { subject: '  ', message: '' } })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION_ERROR')
  })
})

describe('conversation visibility', () => {
  it('scopes the list by role', async () => {
    const mine = await openConversation(customer)
    const theirs = await openConversation(otherCustomer)
    const assignedToOther = await openConversation(otherCustomer, { subject: 'Taken' })
    expect((await accept(assignedToOther.id, otherAgent)).status).toBe(200)

    const ids = async (session: Session, query = '') =>
      ((await api(`/conversations${query}`, { token: session.token })).body.data.items as { id: string }[]).map((c) => c.id).sort()

    expect(await ids(customer)).toEqual([mine.id])
    // Agents see the unassigned queue plus their own, not other agents' conversations.
    expect(await ids(agent)).toEqual([mine.id, theirs.id].sort())
    expect(await ids(otherAgent)).toEqual([mine.id, theirs.id, assignedToOther.id].sort())
    expect(await ids(otherAgent, '?assigned=me')).toEqual([assignedToOther.id])
    expect(await ids(otherAgent, '?assigned=unassigned')).toEqual([mine.id, theirs.id].sort())
    expect(await ids(admin)).toEqual([mine.id, theirs.id, assignedToOther.id].sort())
  })

  it('hides inaccessible conversations as not found', async () => {
    const conversation = await openConversation(customer)
    await accept(conversation.id, otherAgent)

    for (const session of [otherCustomer, agent]) {
      const res = await api(`/conversations/${conversation.id}`, { token: session.token })
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('CONVERSATION_NOT_FOUND')
      expect((await api(`/conversations/${conversation.id}/messages`, { token: session.token })).status).toBe(404)
    }
    expect((await api(`/conversations/${conversation.id}`, { token: customer.token })).status).toBe(200)
    expect((await api(`/conversations/${conversation.id}`, { token: admin.token })).status).toBe(200)
    expect((await api(`/conversations/${randomUUID()}`, { token: admin.token })).status).toBe(404)
    expect((await api('/conversations/not-a-uuid', { token: admin.token })).status).toBe(400)
  })

  it('paginates and filters the list', async () => {
    for (let i = 0; i < 5; i++) await openConversation(customer, { subject: `Issue ${i}` })
    const first = await api('/conversations?limit=2&page=1', { token: customer.token })
    expect(first.body.data).toMatchObject({ page: 1, limit: 2, total: 5, totalPages: 3 })
    // Most recently active first.
    expect(first.body.data.items.map((c: { subject: string }) => c.subject)).toEqual(['Issue 4', 'Issue 3'])
    const last = await api('/conversations?limit=2&page=3', { token: customer.token })
    expect(last.body.data.items.map((c: { subject: string }) => c.subject)).toEqual(['Issue 0'])

    expect((await api('/conversations?status=CLOSED', { token: customer.token })).body.data.total).toBe(0)
    expect((await api('/conversations?limit=500', { token: customer.token })).status).toBe(400)
  })
})

describe('messages', () => {
  it('lets the customer and the assigned agent chat, and records lastMessageAt', async () => {
    const conversation = await openConversation(customer)

    const blocked = await send(conversation.id, agent)
    expect(blocked.status).toBe(403)
    expect(blocked.body.error).toBe('NOT_ASSIGNED')

    expect((await accept(conversation.id)).status).toBe(200)
    const reply = await send(conversation.id, agent, 'Hi, I can help')
    expect(reply.status).toBe(201)
    expect(reply.body.data).toMatchObject({
      content: 'Hi, I can help',
      type: 'TEXT',
      conversationId: conversation.id,
      sender: { id: agent.user.id, name: 'Andy Agent', role: 'AGENT' },
    })
    expect((await send(conversation.id, customer, 'Thanks!')).status).toBe(201)

    const stored = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })
    const latest = await prisma.message.findFirstOrThrow({ where: { conversationId: conversation.id, content: 'Thanks!' } })
    expect(stored.lastMessageAt?.getTime()).toBe(latest.createdAt.getTime())
  })

  it('rejects non-participants', async () => {
    const conversation = await openConversation(customer)
    expect((await send(conversation.id, otherCustomer)).status).toBe(404)

    const adminSend = await send(conversation.id, admin)
    expect(adminSend.status).toBe(403)
    expect(adminSend.body.error).toBe('FORBIDDEN')

    await accept(conversation.id, otherAgent)
    expect((await send(conversation.id, agent)).status).toBe(404)
  })

  it('rejects messages to closed conversations until reopened', async () => {
    const conversation = await openConversation(customer)
    await api(`/conversations/${conversation.id}`, { method: 'PATCH', token: customer.token, body: { status: 'CLOSED' } })

    const res = await send(conversation.id, customer)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('CONVERSATION_CLOSED')

    await api(`/conversations/${conversation.id}`, { method: 'PATCH', token: customer.token, body: { status: 'OPEN' } })
    expect((await send(conversation.id, customer)).status).toBe(201)
  })

  it('validates message content', async () => {
    const conversation = await openConversation(customer)
    expect((await send(conversation.id, customer, '   ')).status).toBe(400)
    expect((await send(conversation.id, customer, 'x'.repeat(5001))).status).toBe(400)
  })

  it('paginates history newest page first with a cursor', async () => {
    const conversation = await openConversation(customer) // message 0 is the opening message
    for (let i = 1; i <= 6; i++) await send(conversation.id, customer, `msg ${i}`)

    const contents = (items: { content: string }[]) => items.map((m) => m.content)
    const page1 = (await api(`/conversations/${conversation.id}/messages?limit=3`, { token: customer.token })).body.data
    expect(contents(page1.items)).toEqual(['msg 4', 'msg 5', 'msg 6'])
    expect(page1.hasMore).toBe(true)

    const page2 = (await api(`/conversations/${conversation.id}/messages?limit=3&before=${page1.nextCursor}`, { token: customer.token })).body.data
    expect(contents(page2.items)).toEqual(['msg 1', 'msg 2', 'msg 3'])

    const page3 = (await api(`/conversations/${conversation.id}/messages?limit=3&before=${page2.nextCursor}`, { token: customer.token })).body.data
    expect(contents(page3.items)).toEqual(['Help, my login fails'])
    expect(page3).toMatchObject({ hasMore: false, nextCursor: null })

    // A cursor from another conversation is rejected.
    const other = await openConversation(customer)
    const res = await api(`/conversations/${other.id}/messages?before=${page1.nextCursor}`, { token: customer.token })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INVALID_CURSOR')
  })

  it('returns deleted messages as tombstones', async () => {
    const conversation = await openConversation(customer)
    await prisma.message.updateMany({ where: { conversationId: conversation.id }, data: { deletedAt: new Date() } })
    const { items } = (await api(`/conversations/${conversation.id}/messages`, { token: customer.token })).body.data
    expect(items[0]).toMatchObject({ content: '', deletedAt: expect.any(String) })
  })
})

describe('updating conversations', () => {
  const patch = (id: string, session: Session, body: unknown) =>
    api(`/conversations/${id}`, { method: 'PATCH', token: session.token, body })

  it('lets customers close and reopen, and adds system messages', async () => {
    const conversation = await openConversation(customer)
    expect((await patch(conversation.id, customer, { status: 'CLOSED' })).body.data.status).toBe('CLOSED')
    expect((await patch(conversation.id, customer, { status: 'OPEN' })).body.data.status).toBe('OPEN')

    const system = await prisma.message.findMany({
      where: { conversationId: conversation.id, type: 'SYSTEM' },
      orderBy: { createdAt: 'asc' },
    })
    expect(system.map((m) => m.content)).toEqual([
      'Cathy Customer closed the conversation',
      'Cathy Customer reopened the conversation',
    ])
    expect(system.every((m) => m.senderId === null)).toBe(true)
  })

  it('limits what customers can change', async () => {
    const conversation = await openConversation(customer)
    expect((await patch(conversation.id, customer, { priority: 'URGENT' })).status).toBe(403)
    expect((await patch(conversation.id, customer, { status: 'PENDING' })).status).toBe(403)
    expect((await patch(conversation.id, otherCustomer, { status: 'CLOSED' })).status).toBe(404)
    expect((await patch(conversation.id, customer, {})).status).toBe(400)
  })

  it('requires agents to be assigned', async () => {
    const conversation = await openConversation(customer)
    expect((await patch(conversation.id, agent, { priority: 'HIGH' })).body.error).toBe('NOT_ASSIGNED')

    await accept(conversation.id)
    const res = await patch(conversation.id, agent, { priority: 'HIGH', status: 'PENDING' })
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ priority: 'HIGH', status: 'PENDING' })
  })

  it('reopens a pending conversation when the customer replies', async () => {
    const conversation = await openConversation(customer)
    await accept(conversation.id)
    await patch(conversation.id, agent, { status: 'PENDING' })
    await send(conversation.id, customer, 'Here is the info')
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).status).toBe('OPEN')
  })

  it('lets admins change status, priority and department', async () => {
    const department = await prisma.department.create({ data: { name: 'Sales' } })
    const conversation = await openConversation(customer)
    const res = await patch(conversation.id, admin, { priority: 'LOW', departmentId: department.id, status: 'CLOSED' })
    expect(res.body.data).toMatchObject({ priority: 'LOW', status: 'CLOSED', department: { name: 'Sales' } })
  })
})

describe('assignment', () => {
  it('lets an agent accept an unassigned conversation, but not one already taken', async () => {
    const conversation = await openConversation(customer)

    const res = await accept(conversation.id)
    expect(res.status).toBe(200)
    expect(res.body.data.agent).toMatchObject({ id: agent.user.id, name: 'Andy Agent' })
    expect((await accept(conversation.id)).status).toBe(200) // idempotent for the same agent

    // Taken conversations disappear from other agents' view entirely.
    expect((await accept(conversation.id, otherAgent)).status).toBe(404)

    const system = await prisma.message.findFirst({ where: { conversationId: conversation.id, type: 'SYSTEM' } })
    expect(system?.content).toBe('Andy Agent joined the conversation')
  })

  it('lets only one of two agents accepting at the same time win', async () => {
    const conversation = await openConversation(customer)
    const results = await Promise.all([accept(conversation.id, agent), accept(conversation.id, otherAgent)])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
  })

  it('stops agents from assigning others and customers from assigning at all', async () => {
    const conversation = await openConversation(customer)
    const res = await api(`/conversations/${conversation.id}/assign`, { token: agent.token, body: { agentId: otherAgent.user.id } })
    expect(res.status).toBe(403)
    expect((await api(`/conversations/${conversation.id}/assign`, { token: customer.token, body: {} })).status).toBe(403)
  })

  it('lets admins assign, reassign and unassign active agents only', async () => {
    const conversation = await openConversation(customer)
    const assign = (agentId: string | null) =>
      api(`/conversations/${conversation.id}/assign`, { token: admin.token, body: { agentId } })

    expect((await assign(agent.user.id)).body.data.agent.id).toBe(agent.user.id)
    expect((await assign(otherAgent.user.id)).body.data.agent.id).toBe(otherAgent.user.id)
    expect((await assign(null)).body.data.agent).toBeNull()

    expect((await assign(customer.user.id)).body.error).toBe('INVALID_AGENT')
    await prisma.user.update({ where: { id: agent.user.id }, data: { status: 'DISABLED' } })
    expect((await assign(agent.user.id)).body.error).toBe('INVALID_AGENT')
    expect((await api(`/conversations/${conversation.id}/assign`, { token: admin.token, body: {} })).status).toBe(400)
  })

  it('does not assign closed conversations', async () => {
    const conversation = await openConversation(customer)
    await api(`/conversations/${conversation.id}`, { method: 'PATCH', token: customer.token, body: { status: 'CLOSED' } })
    expect((await accept(conversation.id)).body.error).toBe('CONVERSATION_CLOSED')
  })
})

describe('GET /api/departments', () => {
  it('shows active departments to users and all departments to admins', async () => {
    await prisma.department.createMany({ data: [{ name: 'Billing' }, { name: 'Legacy', isActive: false }] })
    const names = async (session: Session) =>
      ((await api('/departments', { token: session.token })).body.data as { name: string }[]).map((d) => d.name)
    expect(await names(customer)).toEqual(['Billing'])
    expect(await names(admin)).toEqual(['Billing', 'Legacy'])
  })
})
