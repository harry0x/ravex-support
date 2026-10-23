import type { MessageDto } from './message.service.js'

export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline'

export type ConversationEvent = 'conversation.created' | 'conversation.updated'

export interface ConversationRef {
  id: string
  customerId: string
  agentId: string | null
  /**
   * Also tell every staff member (queues, admin lists). Used for new conversations, assignment
   * and status changes, and messages in unassigned conversations. Messages in an assigned
   * conversation only reach its two participants, so staff lists aren't reloaded per message.
   */
  staff?: boolean
}

/**
 * What the business services need from the realtime layer. Implemented by `src/ravex`, so
 * services never import Ravex directly (and work without it, e.g. in scripts).
 */
export interface RealtimeGateway {
  /** Broadcast a stored message to everyone in the conversation's room. */
  publishMessage(message: MessageDto): void
  /** Tell the conversation's participants (and staff, see ConversationRef.staff) that it changed. */
  notifyConversation(event: ConversationEvent, conversation: ConversationRef): void
  /** Tell one user's own views that a conversation changed for them (e.g. their unread count). */
  notifyUser(userId: string, event: ConversationEvent, conversationId: string): void
  /** Re-check who may stay in a conversation's room after an assignment change. */
  syncConversationAccess(conversationId: string): Promise<void>
  /** Remove a user from every room and disconnect their sockets (disabled, role changed). */
  revokeUser(userId: string): void
  presenceOf(userId: string): PresenceStatus
}

const noopGateway: RealtimeGateway = {
  publishMessage: () => {},
  notifyConversation: () => {},
  notifyUser: () => {},
  syncConversationAccess: async () => {},
  revokeUser: () => {},
  presenceOf: () => 'offline',
}

let current: RealtimeGateway = noopGateway

export function setRealtimeGateway(gateway: RealtimeGateway | null): void {
  current = gateway ?? noopGateway
}

export const realtime: RealtimeGateway = {
  publishMessage: (message) => current.publishMessage(message),
  notifyConversation: (event, conversation) => current.notifyConversation(event, conversation),
  notifyUser: (userId, event, conversationId) => current.notifyUser(userId, event, conversationId),
  syncConversationAccess: (conversationId) => current.syncConversationAccess(conversationId),
  revokeUser: (userId) => current.revokeUser(userId),
  presenceOf: (userId) => current.presenceOf(userId),
}
