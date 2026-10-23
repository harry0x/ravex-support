import type { ChatEngine } from '@ravex/server'
import { prisma } from '../config/database.js'
import { getAccessibleConversation, type Actor } from '../services/conversation.service.js'
import { AppError } from '../utils/AppError.js'

export const SYSTEM_USER_ID = 'system'

/** Participants may send, type, react and mark read; viewers only receive. */
export type AccessLevel = 'participant' | 'viewer'

/**
 * Logical room names clients join:
 * - `conversation:<id>`: one conversation's chat
 * - `staff`: notifications for agents/admins (new or updated conversations)
 * - `user:<id>`: personal notifications (only that user)
 */
export type RoomKey =
  | { kind: 'conversation'; key: string; conversationId: string }
  | { kind: 'staff'; key: string }
  | { kind: 'user'; key: string; userId: string }

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const CONVERSATION_KEY = new RegExp(`^conversation:(${UUID})$`, 'i')
const USER_KEY = new RegExp(`^user:(${UUID})$`, 'i')

export function parseRoomKey(key: unknown): RoomKey | null {
  if (typeof key !== 'string') return null
  if (key === 'staff') return { kind: 'staff', key }
  const conversation = CONVERSATION_KEY.exec(key)
  if (conversation?.[1]) return { kind: 'conversation', key, conversationId: conversation[1].toLowerCase() }
  const user = USER_KEY.exec(key)
  if (user?.[1]) return { kind: 'user', key, userId: user[1].toLowerCase() }
  return null
}

export const conversationRoomKey = (conversationId: string) => `conversation:${conversationId}`
export const userRoomKey = (userId: string) => `user:${userId}`

export interface RoomEntry {
  key: string
  ravexRoomId: string
  conversationId?: string
  /** Access level per user id, recorded when they join. */
  access: Map<string, AccessLevel>
}

/**
 * Maps logical room keys to Ravex rooms. Ravex generates random room ids and keeps rooms in
 * memory only, so rooms are created lazily on first join (and again after a restart).
 */
export class RoomRegistry {
  private readonly byKey = new Map<string, RoomEntry>()
  private readonly byRavexId = new Map<string, RoomEntry>()

  constructor(private readonly engine: ChatEngine) {}

  /** Decides from the database whether (and how) an actor may be in a room. */
  async resolveAccess(actor: Actor, room: RoomKey): Promise<AccessLevel | null> {
    switch (room.kind) {
      case 'staff':
        return actor.role === 'AGENT' || actor.role === 'ADMIN' ? 'viewer' : null
      case 'user':
        return room.userId === actor.id ? 'viewer' : null
      case 'conversation': {
        try {
          const conversation = await getAccessibleConversation(actor, room.conversationId)
          return conversation.customerId === actor.id || conversation.agentId === actor.id ? 'participant' : 'viewer'
        } catch (err) {
          if (err instanceof AppError && err.statusCode === 404) return null
          throw err
        }
      }
    }
  }

  ensureRoom(room: RoomKey): RoomEntry {
    const existing = this.byKey.get(room.key)
    if (existing) return existing

    const conversationId = room.kind === 'conversation' ? room.conversationId : undefined
    const created = this.engine.createRoom({
      type: 'group',
      name: room.key,
      createdBy: SYSTEM_USER_ID,
      isPrivate: true,
      metadata: { key: room.key, conversationId },
    })
    const entry: RoomEntry = { key: room.key, ravexRoomId: created.id, conversationId, access: new Map() }
    this.byKey.set(room.key, entry)
    this.byRavexId.set(created.id, entry)
    return entry
  }

  getByKey(key: string): RoomEntry | undefined {
    return this.byKey.get(key)
  }

  getByRavexId(ravexRoomId: string): RoomEntry | undefined {
    return this.byRavexId.get(ravexRoomId)
  }

  accessOf(ravexRoomId: string, userId: string): AccessLevel | undefined {
    return this.byRavexId.get(ravexRoomId)?.access.get(userId)
  }

  /** Re-evaluates everyone who joined a conversation's room and kicks those who lost access. */
  async syncConversation(conversationId: string): Promise<void> {
    const entry = this.byKey.get(conversationRoomKey(conversationId))
    if (!entry) return
    const room = parseRoomKey(entry.key)
    if (!room) return

    const users = await prisma.user.findMany({
      where: { id: { in: [...entry.access.keys()] }, status: 'ACTIVE' },
      select: { id: true, name: true, role: true },
    })
    const active = new Map(users.map((u) => [u.id, u]))

    for (const userId of [...entry.access.keys()]) {
      const actor = active.get(userId)
      const level = actor ? await this.resolveAccess(actor, room) : null
      if (level) {
        entry.access.set(userId, level)
      } else {
        entry.access.delete(userId)
        this.engine.kickUser(entry.ravexRoomId, userId, 'You no longer have access to this conversation')
      }
    }
  }

  /** Removes a user from every room they joined. */
  revokeUser(userId: string): void {
    for (const entry of this.byKey.values()) {
      if (entry.access.delete(userId)) this.engine.kickUser(entry.ravexRoomId, userId, 'Access revoked')
    }
  }
}
