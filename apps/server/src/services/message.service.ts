import { prisma } from '../config/database.js'
import type { MessageType, Prisma } from '../generated/prisma/client.js'
import { ALLOWED_REACTIONS, type ListMessagesQuery } from '../schemas/conversation.schema.js'
import { AppError } from '../utils/AppError.js'
import { assertOpen, assertParticipant, getAccessibleConversation, type Actor } from './conversation.service.js'
import { realtime } from './realtime.js'

const messageSelect = {
  id: true,
  conversationId: true,
  content: true,
  type: true,
  createdAt: true,
  updatedAt: true,
  editedAt: true,
  deletedAt: true,
  sender: { select: { id: true, name: true, avatarUrl: true, role: true } },
  attachments: {
    select: { id: true, secureUrl: true, originalName: true, mimeType: true, size: true, resourceType: true },
    orderBy: { createdAt: 'asc' },
  },
  reactions: { select: { emoji: true, userId: true }, orderBy: { createdAt: 'asc' } },
  reads: { select: { userId: true, readAt: true } },
} satisfies Prisma.MessageSelect

type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>

/** Deleted messages stay in the timeline as tombstones without content, attachments or reactions. */
function toDto(message: MessageRow) {
  return message.deletedAt ? { ...message, content: '', attachments: [], reactions: [] } : message
}

export type MessageDto = ReturnType<typeof toDto>

// Newest first, with id as a tiebreaker for messages created in the same millisecond.
const NEWEST_FIRST = [{ createdAt: 'desc' }, { id: 'desc' }] satisfies Prisma.MessageOrderByWithRelationInput[]

/**
 * Cursor pagination, newest page first. Pass `before` = the returned `nextCursor` to load older
 * messages. Items within a page are in chronological order.
 */
export async function listMessages(actor: Actor, conversationId: string, query: ListMessagesQuery) {
  await getAccessibleConversation(actor, conversationId)

  if (query.before) {
    const cursor = await prisma.message.findFirst({ where: { id: query.before, conversationId }, select: { id: true } })
    if (!cursor) throw new AppError(400, 'INVALID_CURSOR', 'Unknown message cursor')
  }

  const rows = await prisma.message.findMany({
    where: { conversationId },
    select: messageSelect,
    orderBy: NEWEST_FIRST,
    take: query.limit + 1,
    ...(query.before && { cursor: { id: query.before }, skip: 1 }),
  })

  const hasMore = rows.length > query.limit
  const items = rows.slice(0, query.limit).reverse().map(toDto)
  return { items, hasMore, nextCursor: hasMore ? (items[0]?.id ?? null) : null }
}

export async function getMessageDto(id: string): Promise<MessageDto> {
  return toDto(await prisma.message.findUniqueOrThrow({ where: { id }, select: messageSelect }))
}

/** Broadcasts already-committed messages (e.g. system messages written inside a transaction). */
export async function publishStoredMessages(ids: string[]): Promise<void> {
  for (const id of ids) realtime.publishMessage(await getMessageDto(id))
}

export interface CreateMessageInput {
  content?: string
  attachmentIds?: string[]
}

export interface CreateMessageOptions {
  /** Reuse an id/timestamp generated elsewhere (Ravex creates them for socket messages). */
  id?: string
  createdAt?: Date
  /** False when Ravex broadcasts the message itself. */
  publish?: boolean
}

export async function createMessage(
  actor: Actor,
  conversationId: string,
  input: CreateMessageInput,
  options: CreateMessageOptions = {},
): Promise<MessageDto> {
  const content = input.content?.trim() ?? ''
  const attachmentIds = [...new Set(input.attachmentIds ?? [])]
  if (!content && attachmentIds.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A message needs content or attachments')
  }

  const { message, customerId, agentId } = await prisma.$transaction(async (tx) => {
    const conversation = await getAccessibleConversation(actor, conversationId, tx)
    assertParticipant(actor, conversation)
    assertOpen(conversation)

    let type: MessageType = 'TEXT'
    if (attachmentIds.length > 0) {
      // Only the uploader's own, not-yet-used uploads for this conversation can be attached.
      const uploads = await tx.attachment.findMany({
        where: { id: { in: attachmentIds }, conversationId, uploaderId: actor.id, messageId: null },
        select: { resourceType: true },
      })
      if (uploads.length !== attachmentIds.length) {
        throw new AppError(400, 'INVALID_ATTACHMENT', 'One or more attachments are invalid or already used')
      }
      type = uploads.every((u) => u.resourceType === 'image') ? 'IMAGE' : 'FILE'
    }

    const created = await tx.message.create({
      data: { id: options.id, conversationId, senderId: actor.id, content, type, createdAt: options.createdAt },
    })
    if (attachmentIds.length > 0) {
      await tx.attachment.updateMany({ where: { id: { in: attachmentIds } }, data: { messageId: created.id } })
    }
    // A customer replying to a conversation waiting on them puts it back in the agent's court.
    const reopen = conversation.status === 'PENDING' && actor.id === conversation.customerId
    // Only move lastMessageAt forward: concurrent sends can commit out of order.
    await tx.conversation.updateMany({
      where: { id: conversationId, OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: created.createdAt } }] },
      data: { lastMessageAt: created.createdAt },
    })
    if (reopen) await tx.conversation.update({ where: { id: conversationId }, data: { status: 'OPEN' } })
    return { message: created, customerId: conversation.customerId, agentId: conversation.agentId }
  })

  const dto = await getMessageDto(message.id)
  if (options.publish !== false) realtime.publishMessage(dto)
  realtime.notifyConversation('conversation.updated', { id: conversationId, customerId, agentId })
  return dto
}

// ── Actions on existing messages (used by the Ravex integration) ──────────────

async function loadOwnTarget(actor: Actor, conversationId: string, messageId: string) {
  const conversation = await getAccessibleConversation(actor, conversationId)
  assertParticipant(actor, conversation)
  const message = await prisma.message.findFirst({ where: { id: messageId, conversationId } })
  if (!message || message.deletedAt) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found')
  return { conversation, message }
}

export async function editMessage(actor: Actor, conversationId: string, messageId: string, content: string) {
  const { conversation, message } = await loadOwnTarget(actor, conversationId, messageId)
  assertOpen(conversation)
  if (message.senderId !== actor.id) throw new AppError(403, 'FORBIDDEN', 'You can only edit your own messages')
  if (message.type === 'SYSTEM') throw new AppError(403, 'FORBIDDEN', 'System messages cannot be edited')
  return prisma.message.update({ where: { id: messageId }, data: { content, editedAt: new Date() } })
}

export async function deleteMessage(actor: Actor, conversationId: string, messageId: string) {
  const { message } = await loadOwnTarget(actor, conversationId, messageId)
  if (message.senderId !== actor.id) throw new AppError(403, 'FORBIDDEN', 'You can only delete your own messages')
  return prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } })
}

/** Marks the message and every earlier message from other people in the conversation as read. */
export async function markRead(actor: Actor, conversationId: string, messageId: string): Promise<void> {
  const { message } = await loadOwnTarget(actor, conversationId, messageId)
  const unread = await prisma.message.findMany({
    where: {
      conversationId,
      createdAt: { lte: message.createdAt },
      senderId: { not: actor.id },
      reads: { none: { userId: actor.id } },
    },
    select: { id: true },
  })
  if (unread.length === 0) return
  await prisma.messageRead.createMany({
    data: unread.map((m) => ({ messageId: m.id, userId: actor.id })),
    skipDuplicates: true,
  })
}

/** Ravex broadcasts reactions as toggles, so the database mirrors that: add if absent, else remove. */
export async function toggleReaction(actor: Actor, conversationId: string, messageId: string, emoji: string) {
  if (!(ALLOWED_REACTIONS as readonly string[]).includes(emoji)) {
    throw new AppError(400, 'INVALID_REACTION', 'Unsupported reaction')
  }
  const { message } = await loadOwnTarget(actor, conversationId, messageId)
  if (message.type === 'SYSTEM') throw new AppError(403, 'FORBIDDEN', 'System messages cannot be reacted to')

  const key = { messageId_userId_emoji: { messageId, userId: actor.id, emoji } }
  const existing = await prisma.reaction.findUnique({ where: key })
  if (existing) {
    await prisma.reaction.delete({ where: key })
    return { added: false }
  }
  await prisma.reaction.create({ data: { messageId, userId: actor.id, emoji } })
  return { added: true }
}
