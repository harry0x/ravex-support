import { ChatError, ErrorCodes, type MessageMiddleware } from '@ravex/server'
import { createMessage } from '../services/message.service.js'
import { actorFromRavexUser, toChatError } from './guard.js'
import type { RoomRegistry } from './rooms.js'

/**
 * Ravex runs message middleware *before* broadcasting `message:new` and rejects the send if it
 * throws. Persisting here means a message is only delivered once it is stored in PostgreSQL
 * (Ravex's own PersistenceAdapter is called after the broadcast and only logs failures).
 *
 * The stored message (same id and timestamp) is attached as `metadata.message`, so clients get
 * the same shape from realtime events as from the REST history.
 */
export function persistMessages(registry: RoomRegistry): MessageMiddleware {
  return async (message, user) => {
    const conversationId = registry.getByRavexId(message.roomId)?.conversationId
    if (!conversationId) throw new ChatError('Messages can only be sent in conversation rooms', ErrorCodes.FORBIDDEN)
    // Client-supplied attachment URLs are never trusted; files go through POST /api/uploads.
    if (message.attachments && message.attachments.length > 0) {
      throw new ChatError('Upload files with the REST API', ErrorCodes.VALIDATION)
    }

    try {
      const stored = await createMessage(
        actorFromRavexUser(user),
        conversationId,
        { content: message.content },
        { id: message.id, createdAt: message.createdAt, publish: false },
      )
      message.type = 'text'
      message.content = stored.content
      // Not supported by this app: don't relay arbitrary client data to the room.
      message.replyTo = undefined
      message.metadata = { conversationId, message: stored }
    } catch (err) {
      throw toChatError(err)
    }
  }
}
