import { prisma, type DbClient } from '../config/database.js'
import type { Conversation, ConversationStatus, Prisma } from '../generated/prisma/client.js'
import type {
  AssignConversationInput,
  CreateConversationInput,
  ListConversationsQuery,
  UpdateConversationInput,
} from '../schemas/conversation.schema.js'
import { AppError } from '../utils/AppError.js'
import type { PublicUser } from './auth.service.js'
import { publishStoredMessages } from './message.service.js'
import { realtime } from './realtime.js'

export type Actor = Pick<PublicUser, 'id' | 'name' | 'role'>

function conversationInclude(viewerId: string) {
  return {
    customer: { select: { id: true, name: true, email: true, avatarUrl: true, lastSeenAt: true } },
    agent: { select: { id: true, name: true, avatarUrl: true, lastSeenAt: true } },
    department: { select: { id: true, name: true } },
    messages: {
      where: { deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 1,
      select: { id: true, content: true, type: true, senderId: true, createdAt: true },
    },
    // Messages from other people the viewer hasn't read. `senderId <> viewer` also excludes system messages (NULL sender).
    _count: {
      select: { messages: { where: { senderId: { not: viewerId }, deletedAt: null, reads: { none: { userId: viewerId } } } } },
    },
  } satisfies Prisma.ConversationInclude
}

type ConversationRow = Prisma.ConversationGetPayload<{ include: ReturnType<typeof conversationInclude> }>

function toDto({ messages, _count, ...conversation }: ConversationRow, viewerId: string) {
  // Only participants can mark messages read, so unread counts are only meaningful to them.
  const participant = conversation.customerId === viewerId || conversation.agentId === viewerId
  return {
    ...conversation,
    lastMessage: messages[0] ?? null,
    unreadCount: participant ? _count.messages : 0,
    customer: { ...conversation.customer, presence: realtime.presenceOf(conversation.customer.id) },
    agent: conversation.agent && { ...conversation.agent, presence: realtime.presenceOf(conversation.agent.id) },
  }
}

export type ConversationDto = ReturnType<typeof toDto>

// ── Access rules ─────────────────────────────────────────────────────────────

/** Conversations an actor may see: customers their own, agents theirs plus the unassigned queue, admins all. */
function visibleTo(actor: Actor): Prisma.ConversationWhereInput {
  switch (actor.role) {
    case 'ADMIN':
      return {}
    case 'AGENT':
      return { OR: [{ agentId: actor.id }, { agentId: null }] }
    case 'CUSTOMER':
      return { customerId: actor.id }
  }
}

const notFound = () => new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found')

/** Loads a conversation the actor may view. Inaccessible conversations are reported as not found. */
export async function getAccessibleConversation(actor: Actor, id: string, db: DbClient = prisma): Promise<Conversation> {
  const conversation = await db.conversation.findFirst({ where: { AND: [{ id }, visibleTo(actor)] } })
  if (!conversation) throw notFound()
  return conversation
}

/** Only the owning customer and the assigned agent take part in the chat. Admins are read-only. */
export function assertParticipant(actor: Actor, conversation: Conversation): void {
  if (conversation.customerId === actor.id || conversation.agentId === actor.id) return
  if (actor.role === 'AGENT') {
    throw new AppError(403, 'NOT_ASSIGNED', 'Accept this conversation before replying')
  }
  throw new AppError(403, 'FORBIDDEN', 'Only conversation participants can do this')
}

export function assertOpen(conversation: Conversation): void {
  if (conversation.status === 'CLOSED') {
    throw new AppError(409, 'CONVERSATION_CLOSED', 'This conversation is closed')
  }
}

async function assertActiveDepartment(departmentId: string, db: DbClient): Promise<void> {
  const department = await db.department.findFirst({ where: { id: departmentId, isActive: true } })
  if (!department) throw new AppError(400, 'INVALID_DEPARTMENT', 'Department not found')
}

async function addSystemMessage(db: DbClient, conversationId: string, content: string, at: Date): Promise<string> {
  const message = await db.message.create({ data: { conversationId, content, type: 'SYSTEM', createdAt: at } })
  return message.id
}

/** After a committed change: broadcast its system messages and tell list views to refresh. */
async function announce(conversationId: string, systemMessageIds: string[]): Promise<void> {
  await publishStoredMessages(systemMessageIds)
  const { customerId, agentId } = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { customerId: true, agentId: true },
  })
  realtime.notifyConversation('conversation.updated', { id: conversationId, customerId, agentId, staff: true })
}

/**
 * Puts an agent's open conversations back in the queue (agent disabled or demoted), telling
 * everyone involved with a system message.
 */
export async function returnAgentConversationsToQueue(agentId: string, agentName: string): Promise<void> {
  const conversations = await prisma.conversation.findMany({ where: { agentId, status: { not: 'CLOSED' } }, select: { id: true } })
  for (const { id } of conversations) {
    const now = new Date()
    const systemMessageId = await prisma.$transaction(async (tx) => {
      await tx.conversation.update({ where: { id }, data: { agentId: null, lastMessageAt: now } })
      return addSystemMessage(tx, id, `${agentName} is no longer available — back in the queue`, now)
    })
    await announce(id, [systemMessageId])
  }
}

function searchFilter(q: string): Prisma.ConversationWhereInput {
  const contains = { contains: q, mode: 'insensitive' } as const
  return {
    OR: [
      { subject: contains },
      { customer: { name: contains } },
      { customer: { email: contains } },
      { messages: { some: { content: contains, deletedAt: null } } },
    ],
  }
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function listConversations(actor: Actor, query: ListConversationsQuery) {
  const filters: Prisma.ConversationWhereInput[] = [visibleTo(actor)]
  if (query.status) filters.push({ status: query.status })
  if (query.assigned === 'me') filters.push({ agentId: actor.id })
  if (query.assigned === 'unassigned') filters.push({ agentId: null })
  if (query.q) filters.push(searchFilter(query.q))
  const where = { AND: filters }

  // Not wrapped in $transaction: Prisma loads `include` relations in parallel, which inside a
  // transaction means concurrent queries on one pg connection (deprecated in pg 9).
  const [total, rows] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      include: conversationInclude(actor.id),
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ])

  return {
    items: rows.map((row) => toDto(row, actor.id)),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.ceil(total / query.limit),
  }
}

export async function getConversation(actor: Actor, id: string): Promise<ConversationDto> {
  await getAccessibleConversation(actor, id)
  return toDto(await prisma.conversation.findUniqueOrThrow({ where: { id }, include: conversationInclude(actor.id) }), actor.id)
}

// ── Commands ─────────────────────────────────────────────────────────────────

/** Customers open a conversation together with its first message. */
export async function createConversation(actor: Actor, input: CreateConversationInput): Promise<ConversationDto> {
  if (actor.role !== 'CUSTOMER') throw new AppError(403, 'FORBIDDEN', 'Only customers can open conversations')
  if (input.departmentId) await assertActiveDepartment(input.departmentId, prisma)

  const now = new Date()
  // Nested create is atomic. Relations are loaded afterwards, outside Prisma's implicit transaction.
  const { id } = await prisma.conversation.create({
    data: {
      customerId: actor.id,
      subject: input.subject,
      departmentId: input.departmentId,
      lastMessageAt: now,
      messages: { create: { senderId: actor.id, content: input.message, type: 'TEXT', createdAt: now } },
    },
    select: { id: true },
  })
  realtime.notifyConversation('conversation.created', { id, customerId: actor.id, agentId: null, staff: true })
  return getConversation(actor, id)
}

const STATUS_VERB: Record<ConversationStatus, string> = {
  OPEN: 'reopened the conversation',
  PENDING: 'marked the conversation as pending',
  CLOSED: 'closed the conversation',
}

export async function updateConversation(actor: Actor, id: string, input: UpdateConversationInput): Promise<ConversationDto> {
  const systemMessageIds = await prisma.$transaction(async (tx) => {
    const conversation = await getAccessibleConversation(actor, id, tx)

    if (actor.role === 'CUSTOMER') {
      const onlyStatus = input.priority === undefined && input.departmentId === undefined
      if (!onlyStatus || input.status === 'PENDING') {
        throw new AppError(403, 'FORBIDDEN', 'Customers can only close or reopen their conversations')
      }
    }
    if (actor.role === 'AGENT' && conversation.agentId !== actor.id) {
      throw new AppError(403, 'NOT_ASSIGNED', 'Accept this conversation before changing it')
    }
    if (input.departmentId) await assertActiveDepartment(input.departmentId, tx)

    const now = new Date()
    const statusChanged = input.status !== undefined && input.status !== conversation.status
    await tx.conversation.update({
      where: { id },
      data: {
        status: input.status,
        priority: input.priority,
        departmentId: input.departmentId,
        ...(statusChanged && { lastMessageAt: now }),
      },
    })
    if (statusChanged && input.status) {
      return [await addSystemMessage(tx, id, `${actor.name} ${STATUS_VERB[input.status]}`, now)]
    }
    return []
  })
  await announce(id, systemMessageIds)
  return getConversation(actor, id)
}

/**
 * Agents accept an unassigned conversation (assigning themselves). Admins assign any active
 * agent, reassign, or unassign with `agentId: null`.
 */
export async function assignConversation(actor: Actor, id: string, input: AssignConversationInput): Promise<ConversationDto> {
  const systemMessageIds = await prisma.$transaction(async (tx): Promise<string[]> => {
    const conversation = await getAccessibleConversation(actor, id, tx)
    assertOpen(conversation)
    const now = new Date()

    if (actor.role === 'AGENT') {
      if (input.agentId !== undefined && input.agentId !== actor.id) {
        throw new AppError(403, 'FORBIDDEN', 'Agents can only assign conversations to themselves')
      }
      if (conversation.agentId === actor.id) return []
      // Conditional update so two agents accepting at once can't both win.
      const { count } = await tx.conversation.updateMany({
        where: { id, agentId: null },
        data: { agentId: actor.id, lastMessageAt: now },
      })
      if (count === 0) throw new AppError(409, 'ALREADY_ASSIGNED', 'Another agent has already accepted this conversation')
      return [await addSystemMessage(tx, id, `${actor.name} joined the conversation`, now)]
    }

    if (actor.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this')
    if (input.agentId === undefined) throw new AppError(400, 'VALIDATION_ERROR', 'agentId is required')
    if (input.agentId === conversation.agentId) return []

    if (input.agentId === null) {
      await tx.conversation.update({ where: { id }, data: { agentId: null, lastMessageAt: now } })
      return [await addSystemMessage(tx, id, `${actor.name} unassigned the conversation`, now)]
    }

    const agent = await tx.user.findFirst({ where: { id: input.agentId, role: 'AGENT', status: 'ACTIVE' } })
    if (!agent) throw new AppError(400, 'INVALID_AGENT', 'Agent not found')
    await tx.conversation.update({ where: { id }, data: { agentId: agent.id, lastMessageAt: now } })
    return [await addSystemMessage(tx, id, `${actor.name} assigned the conversation to ${agent.name}`, now)]
  })
  if (systemMessageIds.length > 0) {
    // Agents who just lost access (another agent took it) are removed from the live room. The
    // change is committed, so a failure here is logged rather than failing the request.
    await realtime.syncConversationAccess(id).catch((err: unknown) => console.error('room sync failed:', err))
    await announce(id, systemMessageIds)
  }
  return getConversation(actor, id)
}
