import { randomUUID } from 'node:crypto'
import { ChatEngine, type HttpServerInstance, type TypedNamespace } from '@ravex/server'
import { Server } from 'socket.io'
import { MAX_MESSAGE_LENGTH } from '../schemas/conversation.schema.js'
import type { MessageDto } from '../services/message.service.js'
import { setRealtimeGateway, type ConversationEvent, type RealtimeGateway } from '../services/realtime.js'
import { touchLastSeen } from '../services/user.service.js'
import { authenticateSocket } from './auth.js'
import { guardSocket } from './guard.js'
import { persistMessages } from './persistence.js'
import { conversationRoomKey, RoomRegistry, SYSTEM_USER_ID, userRoomKey } from './rooms.js'
import type { RavexMessage, RavexUser } from './types.js'

export type { RavexMessage, RavexUser } from './types.js'

export interface Realtime {
  engine: ChatEngine
  close(): Promise<void>
}

/** Converts a stored message into Ravex's `message:new` shape (the full DTO rides in metadata). */
function toRavexMessage(message: MessageDto, roomId: string): RavexMessage {
  return {
    id: message.id,
    roomId,
    senderId: message.sender?.id ?? SYSTEM_USER_ID,
    senderName: message.sender?.name ?? 'System',
    content: message.content,
    type: message.type === 'SYSTEM' ? 'system' : message.type === 'IMAGE' ? 'image' : message.type === 'FILE' ? 'file' : 'text',
    chatType: 'group',
    attachments: message.attachments.map((a) => ({
      id: a.id,
      name: a.originalName,
      url: a.secureUrl,
      mimeType: a.mimeType,
      size: a.size,
    })),
    reactions: {},
    deliveryStatus: 'sent',
    metadata: { conversationId: message.conversationId, message },
    createdAt: message.createdAt,
  }
}

export function createRealtime(httpServer: HttpServerInstance, options: { clientUrl: string }): Realtime {
  const io = new Server(httpServer, {
    cors: { origin: options.clientUrl, credentials: true },
    maxHttpBufferSize: 100_000,
  })
  const ns = io.of('/') as TypedNamespace

  // socket.io runs namespace middleware and connection listeners in registration order, so ours
  // are registered before `new ChatEngine(io)` adds Ravex's. They only use `rooms` once a client
  // connects, after it has been created below.
  ns.use(authenticateSocket)
  ns.on('connection', (socket) => {
    guardSocket(socket, rooms)
    const userId = (socket.data as { user?: RavexUser }).user?.id
    socket.on('disconnect', () => {
      if (userId) void touchLastSeen(userId).catch((err: unknown) => console.error('touchLastSeen failed:', err))
    })
  })

  const engine = new ChatEngine(io, {
    message: { maxMessageLength: MAX_MESSAGE_LENGTH, allowEdits: true, allowDeletes: true },
    presence: { awayTimeout: 5 * 60_000 },
    rateLimit: { maxMessages: 30, windowMs: 60_000 },
    messageMiddleware: [(message, user, next) => persistMessages(rooms)(message, user, next)],
  })
  const rooms = new RoomRegistry(engine)

  const emitToKey = (key: string, build: (roomId: string) => RavexMessage) => {
    const entry = rooms.getByKey(key)
    if (entry) ns.to(entry.ravexRoomId).emit('message:new', build(entry.ravexRoomId))
  }

  const notification = (event: ConversationEvent, conversationId: string) => (roomId: string): RavexMessage => ({
    id: randomUUID(),
    roomId,
    senderId: SYSTEM_USER_ID,
    senderName: 'System',
    content: event,
    type: 'system',
    chatType: 'group',
    attachments: [],
    reactions: {},
    deliveryStatus: 'sent',
    metadata: { event, conversationId },
    createdAt: new Date(),
  })

  const gateway: RealtimeGateway = {
    publishMessage(message) {
      emitToKey(conversationRoomKey(message.conversationId), (roomId) => toRavexMessage(message, roomId))
    },
    notifyConversation(event, conversation) {
      if (conversation.staff || !conversation.agentId) emitToKey('staff', notification(event, conversation.id))
      emitToKey(userRoomKey(conversation.customerId), notification(event, conversation.id))
      if (conversation.agentId) emitToKey(userRoomKey(conversation.agentId), notification(event, conversation.id))
    },
    notifyUser(userId, event, conversationId) {
      emitToKey(userRoomKey(userId), notification(event, conversationId))
    },
    async syncConversationAccess(conversationId) {
      await rooms.syncConversation(conversationId)
      // A join whose access check was still in flight during this sync isn't in the access map
      // yet; a second pass shortly after catches it.
      setTimeout(() => void rooms.syncConversation(conversationId).catch((err: unknown) => console.error('room sync failed:', err)), 2000)
    },
    revokeUser(userId) {
      rooms.revokeUser(userId)
      for (const socketId of engine.getUser(userId)?.socketIds ?? []) {
        ns.sockets.get(socketId)?.disconnect(true)
      }
    },
    presenceOf(userId) {
      const user = engine.getUser(userId)
      return user && user.socketIds.length > 0 ? user.status : 'offline'
    },
  }
  setRealtimeGateway(gateway)

  return {
    engine,
    async close() {
      setRealtimeGateway(null)
      engine.destroy()
      await io.close()
    },
  }
}
