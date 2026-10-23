import type { ChatClient } from '@ravex/client'
import type { Message } from './api'

// @ravex/client 0.1.1 does not export its entity types, so derive them from its public API.
// Note: fields typed as Date (e.g. createdAt) arrive as ISO strings over the wire.
export type RavexMessage = Parameters<Parameters<ChatClient['onMessage']>[0]>[0]

export type ConversationEvent = 'conversation.created' | 'conversation.updated'

/** Stored messages carry the server's full DTO in `metadata.message` (see apps/server/src/ravex). */
export function messageFromRealtime(m: RavexMessage): Message | null {
  const stored = m.metadata?.message
  return typeof stored === 'object' && stored !== null && 'id' in stored ? (stored as Message) : null
}

/** Staff and personal rooms receive `system` messages announcing conversation changes. */
export function conversationEventFromRealtime(m: RavexMessage): { event: ConversationEvent; conversationId: string } | null {
  const event = m.metadata?.event
  const conversationId = m.metadata?.conversationId
  if ((event === 'conversation.created' || event === 'conversation.updated') && typeof conversationId === 'string') {
    return { event, conversationId }
  }
  return null
}
