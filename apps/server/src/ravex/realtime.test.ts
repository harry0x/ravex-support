import { randomUUID } from 'node:crypto'
import { ChatClient } from '@ravex/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApi, createUser, resetDatabase, startServer } from '../../test/helpers.js'
import type { AppServer } from '../app.js'
import { prisma } from '../config/database.js'
import { createConversation } from '../services/conversation.service.js'

type Session = Awaited<ReturnType<typeof createUser>>
type StoredMessage = { id: string; content: string; type: string; sender: { id: string } | null }

let server: AppServer
let url: string
let api: ReturnType<typeof createApi>
const clients: ChatClient[] = []

let customer: Session
let agent: Session
let otherAgent: Session
let admin: Session
let otherCustomer: Session

beforeEach(async () => {
  await resetDatabase()
  const started = await startServer()
  server = started.server
  url = started.url
  api = createApi(url)
  ;[customer, agent, otherAgent, admin, otherCustomer] = await Promise.all([
    createUser({ name: 'Cathy Customer' }),
    createUser({ name: 'Andy Agent', role: 'AGENT' }),
    createUser({ name: 'Olga Agent', role: 'AGENT' }),
    createUser({ name: 'Ada Admin', role: 'ADMIN' }),
    createUser({ name: 'Oscar Other' }),
  ])
})

afterEach(async () => {
  clients.splice(0).forEach((c) => c.disconnect())
  await server.realtime.close()
})

function connect(auth: Record<string, unknown>): Promise<ChatClient> {
  const client = new ChatClient({ url, auth, transports: ['websocket'] })
  clients.push(client)
  return new Promise((resolve, reject) => {
    client.rawSocket.once('connect', () => resolve(client))
    client.rawSocket.once('connect_error', reject)
  })
}

const connectAs = (session: Session) => connect({ token: session.token })

function nextEvent<T>(
  subscribe: (listener: (data: T) => void) => () => void,
  matches: (data: T) => boolean = () => true,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off()
      reject(new Error('Timed out waiting for event'))
    }, timeoutMs)
    const off = subscribe((data) => {
      if (!matches(data)) return
      clearTimeout(timer)
      off()
      resolve(data)
    })
  })
}

/** Resolves true if no matching event arrives within the window. */
function noEvent<T>(subscribe: (listener: (data: T) => void) => () => void, windowMs = 400): Promise<boolean> {
  return nextEvent(subscribe, () => true, windowMs).then(
    () => false,
    () => true,
  )
}

async function openConversation(owner: Session = customer) {
  return createConversation(owner.user, { subject: 'Printer on fire', message: 'Help!' })
}

async function assign(conversationId: string, to: Session = agent) {
  const res = await api(`/conversations/${conversationId}/assign`, { token: to.token, body: {} })
  expect(res.status).toBe(200)
}

const storedOf = (message: { metadata?: Record<string, unknown> }) => message.metadata?.message as StoredMessage

describe('handshake', () => {
  it('rejects missing, invalid and disabled credentials', async () => {
    await expect(connect({})).rejects.toThrow(/Authentication required/)
    await expect(connect({ token: 'garbage' })).rejects.toThrow(/Invalid or expired token/)
    await prisma.user.update({ where: { id: otherCustomer.user.id }, data: { status: 'DISABLED' } })
    await expect(connectAs(otherCustomer)).rejects.toThrow(/disabled/)
  })

  it('ignores a client-supplied user object and hides names from namespace-wide presence', async () => {
    const watcher = await connectAs(agent)
    const online = nextEvent(watcher.onUserOnline.bind(watcher), (u) => u.id === customer.user.id)
    const client = await connect({ token: customer.token, user: { id: 'admin', username: 'admin', status: 'online', socketIds: [] } })
    // user:online goes to every socket, so it carries a role label, not the customer's name.
    expect((await online).username).toBe('customer')

    const conversation = await openConversation()
    const room = await client.joinRoom(`conversation:${conversation.id}`)
    const sent = await client.sendMessage({ roomId: room.id, content: 'hi' })
    expect(sent.senderId).toBe(customer.user.id)
    expect(sent.senderName).toBe('Cathy Customer')
  })
})

describe('joining rooms', () => {
  it('only admits users with access to the conversation', async () => {
    const conversation = await openConversation()
    const key = `conversation:${conversation.id}`

    const room = await (await connectAs(customer)).joinRoom(key)
    expect(room.metadata).toMatchObject({ key, conversationId: conversation.id })

    await expect((await connectAs(otherCustomer)).joinRoom(key)).rejects.toThrow(/Not allowed/)
    await expect((await connectAs(admin)).joinRoom(key)).resolves.toBeTruthy()
    // Unassigned: any agent may watch. Once assigned to another agent, no longer.
    await expect((await connectAs(otherAgent)).joinRoom(key)).resolves.toBeTruthy()
    await assign(conversation.id, agent)
    await expect((await connectAs(otherAgent)).joinRoom(key)).rejects.toThrow(/Not allowed/)
  })

  it('restricts staff and personal rooms, and rejects unknown or client-created rooms', async () => {
    const customerClient = await connectAs(customer)
    await expect(customerClient.joinRoom('staff')).rejects.toThrow(/Not allowed/)
    await expect(customerClient.joinRoom(`user:${otherCustomer.user.id}`)).rejects.toThrow(/Not allowed/)
    await expect(customerClient.joinRoom(`user:${customer.user.id}`)).resolves.toBeTruthy()
    await expect(customerClient.joinRoom(randomUUID())).rejects.toThrow(/Unknown room/)
    await expect(customerClient.createRoom({ type: 'group', name: 'rogue' })).rejects.toThrow(/Unsupported or malformed/)
    await expect((await connectAs(agent)).joinRoom('staff')).resolves.toBeTruthy()
  })
})

describe('messaging', () => {
  it('persists socket messages before broadcasting them with the stored DTO', async () => {
    const conversation = await openConversation()
    await assign(conversation.id)
    const key = `conversation:${conversation.id}`
    const customerClient = await connectAs(customer)
    const agentClient = await connectAs(agent)
    const adminClient = await connectAs(admin)
    const room = await customerClient.joinRoom(key)
    await agentClient.joinRoom(key)
    await adminClient.joinRoom(key)

    const toAgent = nextEvent(agentClient.onMessage.bind(agentClient), (m) => m.content === 'Is anyone there?')
    const toAdmin = nextEvent(adminClient.onMessage.bind(adminClient), (m) => m.content === 'Is anyone there?')
    const sent = await customerClient.sendMessage({ roomId: room.id, content: '  Is anyone there?  ' })

    const received = await toAgent
    expect(received.id).toBe(sent.id)
    expect(received.metadata).toMatchObject({ conversationId: conversation.id })
    expect(storedOf(received)).toMatchObject({ id: sent.id, content: 'Is anyone there?', type: 'TEXT', sender: { id: customer.user.id } })
    await toAdmin

    const row = await prisma.message.findUniqueOrThrow({ where: { id: sent.id } })
    expect(row).toMatchObject({ conversationId: conversation.id, senderId: customer.user.id, content: 'Is anyone there?' })
    const updated = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })
    expect(updated.lastMessageAt?.getTime()).toBe(row.createdAt.getTime())
  })

  it('rejects sends from viewers, to closed conversations, and with client-supplied attachments', async () => {
    const conversation = await openConversation()
    const key = `conversation:${conversation.id}`
    const adminClient = await connectAs(admin)
    const adminRoom = await adminClient.joinRoom(key)
    await expect(adminClient.sendMessage({ roomId: adminRoom.id, content: 'hi' })).rejects.toThrow(/participants/)

    const agentClient = await connectAs(agent)
    const agentRoom = await agentClient.joinRoom(key)
    await expect(agentClient.sendMessage({ roomId: agentRoom.id, content: 'hi' })).rejects.toThrow(/Accept this conversation/)

    const customerClient = await connectAs(customer)
    const room = await customerClient.joinRoom(key)
    await expect(
      customerClient.sendMessage({
        roomId: room.id,
        content: 'see file',
        attachments: [{ id: 'x', name: 'evil.exe', url: 'https://evil.example/x', mimeType: 'application/octet-stream', size: 1 }],
      }),
    ).rejects.toThrow(/REST API/)

    await prisma.conversation.update({ where: { id: conversation.id }, data: { status: 'CLOSED' } })
    await expect(customerClient.sendMessage({ roomId: room.id, content: 'hello?' })).rejects.toThrow(/closed/)

    expect(await prisma.message.count({ where: { conversationId: conversation.id } })).toBe(1) // only the opening message
  })

  it('broadcasts messages sent through the REST API', async () => {
    const conversation = await openConversation()
    await assign(conversation.id)
    const customerClient = await connectAs(customer)
    await customerClient.joinRoom(`conversation:${conversation.id}`)

    const received = nextEvent(customerClient.onMessage.bind(customerClient), (m) => m.content === 'Sent via REST')
    const res = await api(`/conversations/${conversation.id}/messages`, { token: agent.token, body: { content: 'Sent via REST' } })
    expect(res.status).toBe(201)
    expect(storedOf(await received).id).toBe(res.body.data.id)
  })

  it('relays typing only from participants', async () => {
    const conversation = await openConversation()
    const key = `conversation:${conversation.id}`
    const customerClient = await connectAs(customer)
    const watcher = await connectAs(otherAgent) // unassigned: a viewer
    const room = await customerClient.joinRoom(key)
    await watcher.joinRoom(key)

    const typing = nextEvent(watcher.onTypingStart.bind(watcher))
    customerClient.startTyping(room.id)
    expect(await typing).toMatchObject({ userId: customer.user.id, roomId: room.id })

    const customerHearsNothing = noEvent(customerClient.onTypingStart.bind(customerClient))
    watcher.startTyping(room.id)
    expect(await customerHearsNothing).toBe(true)
  })
})

describe('read receipts, reactions, edits and deletes', () => {
  async function chat() {
    const conversation = await openConversation()
    await assign(conversation.id)
    const key = `conversation:${conversation.id}`
    const customerClient = await connectAs(customer)
    const agentClient = await connectAs(agent)
    const room = await customerClient.joinRoom(key)
    await agentClient.joinRoom(key)
    const agentMessage = await agentClient.sendMessage({ roomId: room.id, content: 'How can I help?' })
    return { conversation, room, customerClient, agentClient, agentMessage }
  }

  it('persists read receipts (including earlier messages) and notifies the sender', async () => {
    const { conversation, room, customerClient, agentClient, agentMessage } = await chat()
    const receipt = nextEvent(agentClient.onReadReceipt.bind(agentClient))
    customerClient.markAsRead(agentMessage.id, room.id)
    expect(await receipt).toMatchObject({ messageId: agentMessage.id, readBy: customer.user.id })

    const reads = await prisma.messageRead.findMany({ where: { userId: customer.user.id } })
    const unreadForCustomer = await prisma.message.count({
      where: { conversationId: conversation.id, senderId: { not: customer.user.id }, reads: { none: { userId: customer.user.id } } },
    })
    expect(reads.map((r) => r.messageId)).toContain(agentMessage.id)
    expect(unreadForCustomer).toBe(0)

    // The reader's own lists are told to refresh (their unread count changed).
    await customerClient.joinRoom(`user:${customer.user.id}`)
    const refresh = nextEvent(customerClient.onMessage.bind(customerClient), (m) => m.metadata?.event === 'conversation.updated')
    customerClient.markAsRead(agentMessage.id, room.id)
    expect((await refresh).metadata).toMatchObject({ conversationId: conversation.id })

    const listed = await api(`/conversations/${conversation.id}/messages`, { token: agent.token })
    const stored = listed.body.data.items.find((m: { id: string }) => m.id === agentMessage.id)
    expect(stored.reads).toEqual([{ userId: customer.user.id, readAt: expect.any(String) }])
  })

  it('toggles reactions in the database and broadcasts them', async () => {
    const { room, customerClient, agentClient, agentMessage } = await chat()

    const reaction = nextEvent(agentClient.onReaction.bind(agentClient))
    await customerClient.sendReaction(agentMessage.id, room.id, '👍')
    expect(await reaction).toMatchObject({ messageId: agentMessage.id, userId: customer.user.id, emoji: '👍' })
    expect(await prisma.reaction.count({ where: { messageId: agentMessage.id } })).toBe(1)

    await customerClient.sendReaction(agentMessage.id, room.id, '👍')
    expect(await prisma.reaction.count({ where: { messageId: agentMessage.id } })).toBe(0)

    await expect(customerClient.sendReaction(agentMessage.id, room.id, '🤡')).rejects.toThrow(/Unsupported reaction/)
    await expect(customerClient.sendReaction(randomUUID(), room.id, '👍')).rejects.toThrow(/not found/)
  })

  it('lets senders edit and delete only their own messages', async () => {
    const { room, customerClient, agentClient, agentMessage } = await chat()

    await expect(customerClient.editMessage({ messageId: agentMessage.id, roomId: room.id, content: 'hacked' })).rejects.toThrow(/own messages/)
    await expect(customerClient.deleteMessage(agentMessage.id, room.id)).rejects.toThrow(/own messages/)

    const edited = nextEvent(customerClient.onMessageEdited.bind(customerClient))
    await agentClient.editMessage({ messageId: agentMessage.id, roomId: room.id, content: '  How can I help you today?  ' })
    expect(await edited).toMatchObject({ messageId: agentMessage.id, content: 'How can I help you today?' })
    const row = await prisma.message.findUniqueOrThrow({ where: { id: agentMessage.id } })
    expect(row.content).toBe('How can I help you today?')
    expect(row.editedAt).not.toBeNull()

    const deleted = nextEvent(customerClient.onMessageDeleted.bind(customerClient))
    await agentClient.deleteMessage(agentMessage.id, room.id)
    expect(await deleted).toMatchObject({ messageId: agentMessage.id, deletedBy: agent.user.id })
    expect((await prisma.message.findUniqueOrThrow({ where: { id: agentMessage.id } })).deletedAt).not.toBeNull()
  })

  it('ignores reactions and reads from users who have not joined as participants', async () => {
    const { room, agentMessage } = await chat()
    const outsider = await connectAs(otherAgent)
    await expect(outsider.sendReaction(agentMessage.id, room.id, '👍')).rejects.toThrow(/participants/)
    expect(await prisma.reaction.count()).toBe(0)
  })
})

describe('access changes and notifications', () => {
  it('kicks viewers who lose access when another agent accepts, and broadcasts the system message', async () => {
    const conversation = await openConversation()
    const key = `conversation:${conversation.id}`
    const watcher = await connectAs(otherAgent)
    const customerClient = await connectAs(customer)
    await watcher.joinRoom(key)
    await customerClient.joinRoom(key)

    const kicked = nextEvent(watcher.onKickedFromRoom.bind(watcher))
    const joinedNotice = nextEvent(customerClient.onMessage.bind(customerClient), (m) => m.type === 'system')
    await assign(conversation.id, agent)

    await kicked
    expect((await joinedNotice).content).toBe('Andy Agent joined the conversation')
  })

  it('notifies staff about new conversations and customers about updates to theirs', async () => {
    const staff = await connectAs(agent)
    await staff.joinRoom('staff')
    const customerClient = await connectAs(customer)
    await customerClient.joinRoom(`user:${customer.user.id}`)

    const created = nextEvent(staff.onMessage.bind(staff), (m) => m.metadata?.event === 'conversation.created')
    const res = await api('/conversations', { token: customer.token, body: { subject: 'New one', message: 'Hello' } })
    expect((await created).metadata).toMatchObject({ conversationId: res.body.data.id })

    const updated = nextEvent(customerClient.onMessage.bind(customerClient), (m) => m.metadata?.event === 'conversation.updated')
    await assign(res.body.data.id, agent)
    expect((await updated).metadata).toMatchObject({ conversationId: res.body.data.id })
  })

  it('disconnects users whose account is disabled', async () => {
    const agentClient = await connectAs(agent)
    const disconnected = new Promise<string>((resolve) => agentClient.rawSocket.once('disconnect', resolve))
    const res = await api(`/users/${agent.user.id}`, { method: 'PATCH', token: admin.token, body: { status: 'DISABLED' } })
    expect(res.status).toBe(200)
    expect(await disconnected).toBe('io server disconnect')
  })
})

describe('presence', () => {
  it('reports live presence in conversation responses and records lastSeenAt on disconnect', async () => {
    const conversation = await openConversation()
    await assign(conversation.id)
    const presence = async () =>
      (await api(`/conversations/${conversation.id}`, { token: customer.token })).body.data.agent.presence as string

    expect(await presence()).toBe('offline')
    const agentClient = await connectAs(agent)
    expect(await presence()).toBe('online')

    agentClient.disconnect()
    await expect.poll(presence).toBe('offline')
    await expect
      .poll(async () => (await prisma.user.findUniqueOrThrow({ where: { id: agent.user.id } })).lastSeenAt)
      .not.toBeNull()
  })
})

describe('robustness', () => {
  it('survives malformed and unsupported packets that would crash Ravex', async () => {
    const client = await connectAs(customer)
    const raw = client.rawSocket as unknown as { emit: (...args: unknown[]) => void }
    // Ravex 0.1.1 calls ack() unchecked and destructures payloads unchecked; each of these used to
    // throw inside socket.io's nextTick and exit the process.
    raw.emit('room:list')
    raw.emit('presence:status')
    raw.emit('message:send', { roomId: 'x', content: 'no ack' })
    raw.emit('room:members', { roomId: 'x' })
    raw.emit('room:join', 'not-an-object', () => {})
    await new Promise((r) => setTimeout(r, 300))

    // Still alive and serving.
    const conversation = await openConversation()
    const room = await client.joinRoom(`conversation:${conversation.id}`)
    const sent = await client.sendMessage({ roomId: room.id, content: 'still here' })
    expect(sent.content).toBe('still here')
  })

  it('keeps a user live in their other tabs when one tab leaves a room', async () => {
    const conversation = await openConversation()
    await assign(conversation.id)
    const key = `conversation:${conversation.id}`
    const tabA = await connectAs(customer)
    const tabB = await connectAs(customer)
    const agentClient = await connectAs(agent)
    await tabA.joinRoom(key)
    const roomB = await tabB.joinRoom(key)
    await agentClient.joinRoom(key)

    await tabA.leaveRoom(key)

    // Tab B can still send and type; the agent still hears tab B.
    const typing = nextEvent(agentClient.onTypingStart.bind(agentClient))
    tabB.startTyping(roomB.id)
    await typing
    const sent = await tabB.sendMessage({ roomId: roomB.id, content: 'from tab B' })
    expect(sent.content).toBe('from tab B')
    // Tab A no longer receives the room's messages.
    expect(await noEvent(tabA.onMessage.bind(tabA))).toBe(true)
  })

  it('rate-limits database-backed socket events per connection', async () => {
    const conversation = await openConversation()
    const client = await connectAs(customer)
    const key = `conversation:${conversation.id}`
    const results = await Promise.allSettled(Array.from({ length: 40 }, () => client.joinRoom(key)))
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
    expect(rejected.length).toBeGreaterThan(0)
    expect(String(rejected[0]?.reason)).toMatch(/Too many requests/)
  })
})

