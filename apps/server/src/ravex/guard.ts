import { ChatError, ErrorCodes } from '@ravex/server'
import type { Socket } from 'socket.io'
import type { Role } from '../generated/prisma/client.js'
import { messageContent } from '../schemas/conversation.schema.js'
import type { Actor } from '../services/conversation.service.js'
import * as messages from '../services/message.service.js'
import { realtime } from '../services/realtime.js'
import { AppError } from '../utils/AppError.js'
import { parseRoomKey, type RoomRegistry } from './rooms.js'
import type { RavexUser } from './types.js'

const ROLES: readonly Role[] = ['CUSTOMER', 'AGENT', 'ADMIN']

/** Rebuilds our service-layer actor from the server-built Ravex user (see auth.ts). */
export function actorFromRavexUser(user: RavexUser): Actor {
  const role = user.metadata?.role
  if (typeof role !== 'string' || !(ROLES as readonly string[]).includes(role)) {
    throw new ChatError('Unknown user role', ErrorCodes.UNAUTHORIZED)
  }
  return { id: user.id, name: user.displayName ?? user.username, role: role as Role }
}

/** Converts service errors into Ravex's error type so they reach the client's ack. */
export function toChatError(err: unknown): ChatError {
  if (err instanceof ChatError) return err
  if (err instanceof AppError) {
    const code =
      err.statusCode === 401
        ? ErrorCodes.UNAUTHORIZED
        : err.statusCode === 403 || err.statusCode === 404
          ? ErrorCodes.FORBIDDEN
          : err.statusCode < 500
            ? ErrorCodes.VALIDATION
            : ErrorCodes.INTERNAL
    return new ChatError(err.message, code, { error: err.code })
  }
  console.error('Realtime error:', err)
  return new ChatError('Something went wrong', ErrorCodes.INTERNAL)
}

/**
 * Every client event the app uses, and its expected shape. Anything else is dropped.
 *
 * This matters for availability, not just authorization: Ravex 0.1.1 calls `ack(...)` without
 * checking it exists and destructures payloads without checks, and socket.io runs handlers in
 * `process.nextTick` without a try/catch. So `socket.emit('room:list')` without a callback, or
 * `presence:status` without a payload, would throw an uncaught exception and kill the process.
 * Unused Ravex events (room:list, room:members, room:create/delete, message:history) are blocked.
 */
const CLIENT_EVENTS: Record<string, { ack: boolean; payload: boolean }> = {
  'message:send': { ack: true, payload: true },
  'message:edit': { ack: true, payload: true },
  'message:delete': { ack: true, payload: true },
  'message:react': { ack: true, payload: true },
  'message:read': { ack: false, payload: true },
  'typing:start': { ack: false, payload: true },
  'typing:stop': { ack: false, payload: true },
  'room:join': { ack: true, payload: true },
  'room:leave': { ack: true, payload: true },
  'presence:ping': { ack: false, payload: false },
  'presence:status': { ack: false, payload: true },
}

const PARTICIPANT_EVENTS = new Set(['typing:start', 'typing:stop', 'message:read', 'message:react', 'message:edit', 'message:delete'])

// Events that cost database work are rate-limited per socket (typing and presence are cheap and
// already throttled by Ravex; message:send also has Ravex's own per-user limit).
const LIMITED_EVENTS = new Set(['message:send', 'message:edit', 'message:delete', 'message:react', 'message:read', 'room:join', 'room:leave'])
const BUCKET_CAPACITY = 30
const BUCKET_REFILL_PER_SEC = 5

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const str = (value: unknown): string => (typeof value === 'string' ? value : '')

type Ack = (response: unknown) => void

/** Returns the payload and ack if the packet matches the event's expected shape, else null. */
function validatePacket(packet: unknown[]): { event: string; payload: Record<string, unknown>; ack?: Ack } | null {
  const event = packet[0]
  if (typeof event !== 'string') return null
  const rule = CLIENT_EVENTS[event]
  if (!rule) return null
  const payload = packet[1]
  if (rule.payload && !isObject(payload)) return null
  const ack = rule.ack ? packet[2] : undefined
  if (rule.ack && typeof ack !== 'function') return null
  if (event === 'presence:status' && !['online', 'away', 'busy'].includes(str((payload as Record<string, unknown>).status))) return null
  return { event, payload: rule.payload ? (payload as Record<string, unknown>) : {}, ack: ack as Ack | undefined }
}

/**
 * Per-socket packet middleware that runs before Ravex's handlers (attached from a `connection`
 * listener registered before ChatEngine is constructed). It:
 * - drops unknown or malformed packets (see CLIENT_EVENTS) and rate-limits database-backed ones;
 * - translates logical room keys (`conversation:<id>`, `staff`, `user:<id>`) on `room:join`
 *   after checking access in the database (Ravex itself lets anyone join any room);
 * - handles `room:leave` itself, per socket (see below);
 * - only lets conversation participants type, react, mark read, edit and delete;
 * - persists reads, reactions, edits and deletes *before* Ravex broadcasts them.
 * Rejected packets are dropped and answered with a Ravex-shaped error ack when one is expected.
 */
export function guardSocket(socket: Socket, registry: RoomRegistry): void {
  let tokens = BUCKET_CAPACITY
  let refilledAt = Date.now()

  socket.use((packet, next) => {
    const valid = validatePacket(packet)
    if (!valid) {
      const last: unknown = packet[packet.length - 1]
      if (typeof last === 'function') last({ ok: false, error: { code: ErrorCodes.VALIDATION, message: 'Unsupported or malformed event' } })
      return
    }
    const { event, payload, ack } = valid
    const reject = (err: unknown) => {
      const chatErr = toChatError(err)
      ack?.({ ok: false, error: { code: chatErr.code, message: chatErr.message } })
    }

    if (LIMITED_EVENTS.has(event)) {
      const now = Date.now()
      tokens = Math.min(BUCKET_CAPACITY, tokens + ((now - refilledAt) / 1000) * BUCKET_REFILL_PER_SEC)
      refilledAt = now
      if (tokens < 1) {
        reject(new ChatError('Too many requests, slow down', ErrorCodes.RATE_LIMIT))
        return
      }
      tokens -= 1
    }

    handlePacket(socket, registry, event, payload, ack).then((pass) => pass && next(), reject)
  })
}

/** Returns true to pass the packet on to Ravex, false if it was fully handled here. */
async function handlePacket(socket: Socket, registry: RoomRegistry, event: string, payload: Record<string, unknown>, ack?: Ack): Promise<boolean> {
  const actor = actorFromRavexUser((socket.data as { user: RavexUser }).user)

  if (event === 'room:join') {
    const room = parseRoomKey(payload.roomId)
    if (!room) throw new ChatError('Unknown room', ErrorCodes.ROOM_NOT_FOUND)
    const level = await registry.resolveAccess(actor, room)
    if (!level) throw new ChatError('Not allowed to join this room', ErrorCodes.FORBIDDEN)
    const entry = registry.ensureRoom(room)
    entry.access.set(actor.id, level)
    // Hand Ravex its own room id; the ack's Room carries `metadata.key` back to the client.
    payload.roomId = entry.ravexRoomId
    return true
  }

  if (event === 'room:leave') {
    // Ravex's room:leave removes the *user* from the member list while only this socket leaves,
    // which breaks the user's other tabs and hides them from access re-checks. Leaving is per
    // socket here instead: this socket stops receiving the room's events, and the user's access
    // record stays so later revocations (kicks) still reach their other sockets.
    const room = parseRoomKey(payload.roomId)
    const entry = room && registry.getByKey(room.key)
    if (entry) await socket.leave(entry.ravexRoomId)
    ack?.({ ok: true, data: undefined })
    return false
  }

  if (!PARTICIPANT_EVENTS.has(event)) return true

  const roomId = str(payload.roomId)
  const entry = registry.getByRavexId(roomId)
  if (!entry || registry.accessOf(roomId, actor.id) !== 'participant' || !entry.conversationId) {
    throw new ChatError('Only conversation participants can do this', ErrorCodes.FORBIDDEN)
  }
  const { conversationId } = entry
  const messageId = str(payload.messageId)

  switch (event) {
    case 'message:read':
      await messages.markRead(actor, conversationId, messageId)
      // The reader's own conversation lists show unread counts.
      realtime.notifyUser(actor.id, 'conversation.updated', conversationId)
      return true
    case 'message:react':
      await messages.toggleReaction(actor, conversationId, messageId, str(payload.emoji))
      return true
    case 'message:edit': {
      const content = messageContent.safeParse(payload.content)
      if (!content.success) throw new ChatError(content.error.issues[0]?.message ?? 'Invalid content', ErrorCodes.VALIDATION)
      payload.content = content.data
      await messages.editMessage(actor, conversationId, messageId, content.data)
      return true
    }
    case 'message:delete':
      await messages.deleteMessage(actor, conversationId, messageId)
      return true
  }
  return true
}
