import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../services/api'
import { useCurrentUser } from '../stores/auth'
import { useRealtime, useRoom } from '../stores/realtime'
import type { Conversation, Message } from '../types/api'
import { messageFromRealtime } from '../types/ravex'

const PAGE_SIZE = 30
const SEND_TIMEOUT_MS = 10_000

/** socket.io acks never time out on their own; don't leave the composer waiting forever. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('No response from the server. Check the conversation before resending.')), ms)
    promise.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e: unknown) => {
        clearTimeout(t)
        reject(e instanceof Error ? e : new Error(String(e)))
      },
    )
  })
}

function upsert(list: Message[], message: Message): Message[] {
  const i = list.findIndex((m) => m.id === message.id)
  if (i === -1) return [...list, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const next = [...list]
  next[i] = message
  return next
}

/** Mirrors the server: reading a message marks it and every earlier message from others as read. */
function applyRead(list: Message[], messageId: string, readBy: string, readAt: string): Message[] {
  const target = list.find((m) => m.id === messageId)
  if (!target) return list
  return list.map((m) =>
    m.createdAt <= target.createdAt && m.sender && m.sender.id !== readBy && !m.reads.some((r) => r.userId === readBy)
      ? { ...m, reads: [...m.reads, { userId: readBy, readAt }] }
      : m,
  )
}

/**
 * Everything a chat screen needs for one conversation: REST history (cursor-paginated) merged with
 * live Ravex events, typing indicators, read receipts, reactions, edits, deletes and uploads.
 */
export function useConversationChat(conversationId: string) {
  const me = useCurrentUser()
  const { client } = useRealtime()
  const { roomId, error: roomError } = useRoom(`conversation:${conversationId}`)

  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [typing, setTyping] = useState<Record<string, string>>({})
  const conversationRef = useRef(conversation)
  conversationRef.current = conversation

  // Responses to overlapping updates (or a refresh racing an update) can arrive out of order;
  // never replace the conversation with an older snapshot.
  const applyConversation = useCallback((next: Conversation) => {
    setConversation((prev) => (prev && prev.id === next.id && prev.updatedAt > next.updatedAt ? prev : next))
  }, [])

  const refreshConversation = useCallback(() => {
    api.conversations.get(conversationId).then(applyConversation, () => undefined)
  }, [conversationId, applyConversation])

  const loadLatest = useCallback(async () => {
    const page = await api.conversations.messages(conversationId, { limit: PAGE_SIZE })
    // Merge rather than replace, so a catch-up after reconnecting keeps older pages already loaded.
    setMessages((prev) => page.items.reduce(upsert, prev))
    return page
  }, [conversationId])

  // Initial load (and manual retries).
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setMessages([])
    setTyping({})
    Promise.all([api.conversations.get(conversationId), loadLatest()])
      .then(([conv, page]) => {
        if (cancelled) return
        setConversation(conv)
        setHasMore(page.hasMore)
        setCursor(page.nextCursor)
      })
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [conversationId, loadLatest, attempt])

  // After (re)joining the room, fetch anything sent while we were disconnected.
  const joinedOnce = useRef(false)
  useEffect(() => {
    if (!roomId) return
    if (joinedOnce.current) void loadLatest().catch(() => undefined)
    joinedOnce.current = true
  }, [roomId, loadLatest])

  // Live events for this room.
  useEffect(() => {
    if (!client || !roomId) return
    const nameOf = (userId: string) => {
      const c = conversationRef.current
      if (c?.customer.id === userId) return c.customer.name
      if (c?.agent?.id === userId) return c.agent.name
      return 'Someone'
    }
    const offs = [
      client.onMessage((m) => {
        if (m.roomId !== roomId) return
        const message = messageFromRealtime(m)
        if (!message) return
        setMessages((prev) => upsert(prev, message))
        const senderId = message.sender?.id
        if (senderId) setTyping(({ [senderId]: _, ...rest }) => rest)
        // System messages announce status/assignment changes.
        // System messages announce status/assignment changes; a customer reply also reopens a
        // pending conversation without one.
        if (message.type === 'SYSTEM' || (message.sender?.role === 'CUSTOMER' && conversationRef.current?.status === 'PENDING')) {
          refreshConversation()
        }
      }),
      client.onTypingStart((e) => {
        if (e.roomId === roomId && e.userId !== me.id) setTyping((prev) => ({ ...prev, [e.userId]: nameOf(e.userId) }))
      }),
      client.onTypingStop((e) => {
        if (e.roomId === roomId) setTyping(({ [e.userId]: _, ...rest }) => rest)
      }),
      client.onReadReceipt((e) => {
        if (e.roomId === roomId) setMessages((prev) => applyRead(prev, e.messageId, e.readBy, String(e.readAt)))
      }),
      client.onReaction((e) => {
        if (e.roomId !== roomId) return
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== e.messageId) return m
            const has = m.reactions.some((r) => r.userId === e.userId && r.emoji === e.emoji)
            return {
              ...m,
              reactions: has
                ? m.reactions.filter((r) => !(r.userId === e.userId && r.emoji === e.emoji))
                : [...m.reactions, { userId: e.userId, emoji: e.emoji }],
            }
          }),
        )
      }),
      client.onMessageEdited((e) => {
        if (e.roomId !== roomId) return
        setMessages((prev) => prev.map((m) => (m.id === e.messageId ? { ...m, content: e.content, editedAt: String(e.editedAt) } : m)))
      }),
      client.onMessageDeleted((e) => {
        if (e.roomId !== roomId) return
        const now = new Date().toISOString()
        setMessages((prev) =>
          prev.map((m) => (m.id === e.messageId ? { ...m, content: '', attachments: [], reactions: [], deletedAt: now } : m)),
        )
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [client, roomId, me.id, refreshConversation])

  // Leaving or losing the room (disconnect, kick): typing state is stale. A kick also means the
  // conversation changed (e.g. another agent accepted it), so refresh the header.
  useEffect(() => {
    if (!roomId) setTyping({})
  }, [roomId])
  useEffect(() => {
    if (roomError) refreshConversation()
  }, [roomError, refreshConversation])

  const loadOlder = useCallback(async () => {
    if (!cursor || loadingOlder) return
    setLoadingOlder(true)
    try {
      const page = await api.conversations.messages(conversationId, { before: cursor, limit: PAGE_SIZE })
      setMessages((prev) => page.items.reduce(upsert, prev))
      setHasMore(page.hasMore)
      setCursor(page.nextCursor)
    } finally {
      setLoadingOlder(false)
    }
  }, [conversationId, cursor, loadingOlder])

  const live = client && roomId ? { client, roomId } : null

  const send = useCallback(
    async (content: string, files: File[] = []) => {
      if (files.length > 0) {
        const uploads = await Promise.all(files.map((file) => api.uploads.create(conversationId, file)))
        const message = await api.conversations.send(conversationId, { content: content || undefined, attachmentIds: uploads.map((u) => u.id) })
        setMessages((prev) => upsert(prev, message))
        return
      }
      if (live) {
        live.client.stopTyping(live.roomId)
        await withTimeout(live.client.sendMessage({ roomId: live.roomId, content }), SEND_TIMEOUT_MS)
        return
      }
      // Not connected: the REST API stores (and broadcasts) the message too.
      const message = await api.conversations.send(conversationId, { content })
      setMessages((prev) => upsert(prev, message))
    },
    [conversationId, live],
  )

  // Mark the newest message from someone else as read (covers everything before it).
  const markRead = useCallback(() => {
    if (!live || document.visibilityState !== 'visible') return
    const latest = [...messages].reverse().find((m) => m.sender && m.sender.id !== me.id && !m.deletedAt)
    if (!latest || latest.reads.some((r) => r.userId === me.id)) return
    const isParticipant = conversation && (conversation.customer.id === me.id || conversation.agent?.id === me.id)
    if (!isParticipant) return
    live.client.markAsRead(latest.id, live.roomId)
    setMessages((prev) => applyRead(prev, latest.id, me.id, new Date().toISOString()))
  }, [live, messages, me.id, conversation])

  const actions = useMemo(
    () => ({
      toggleReaction: (messageId: string, emoji: string) => live?.client.sendReaction(messageId, live.roomId, emoji),
      edit: (messageId: string, content: string) => live?.client.editMessage({ messageId, roomId: live.roomId, content }),
      remove: (messageId: string) => live?.client.deleteMessage(messageId, live.roomId),
      startTyping: () => live?.client.startTyping(live.roomId),
      stopTyping: () => live?.client.stopTyping(live.roomId),
    }),
    [live],
  )

  const updateConversation = useCallback(
    async (change: () => Promise<Conversation>) => {
      applyConversation(await change())
    },
    [applyConversation],
  )

  return {
    conversation,
    messages,
    hasMore,
    loading,
    loadingOlder,
    error,
    roomError,
    isLive: Boolean(live),
    typingNames: Object.values(typing),
    loadOlder,
    send,
    markRead,
    updateConversation,
    refreshConversation,
    retry: () => setAttempt((n) => n + 1),
    ...actions,
  }
}
