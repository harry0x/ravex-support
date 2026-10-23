import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ConversationFilters } from '../services/api'
import { useCurrentUser } from '../stores/auth'
import { useRealtime, useRoom } from '../stores/realtime'
import type { Conversation, Page } from '../types/api'
import { conversationEventFromRealtime } from '../types/ravex'

/**
 * A page of conversations that refreshes itself when the server announces changes: everyone
 * listens on their personal `user:<id>` room (own conversations, unread counts), and staff also
 * on the `staff` room (any conversation they might see).
 */
export function useConversationList(filters: ConversationFilters) {
  const me = useCurrentUser()
  const { client, seedPresence } = useRealtime()
  const { roomId: personalRoomId } = useRoom(`user:${me.id}`)
  const { roomId: staffRoomId } = useRoom(me.role === 'CUSTOMER' ? null : 'staff')
  const [data, setData] = useState<Page<Conversation> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const filtersKey = JSON.stringify(filters)
  // Responses can arrive out of order (filter changes, live refreshes); only the newest applies.
  const latestRequest = useRef(0)
  const reload = useCallback(() => {
    const request = ++latestRequest.current
    return api.conversations.list(JSON.parse(filtersKey) as ConversationFilters).then(
      (page) => {
        if (request !== latestRequest.current) return
        setData(page)
        setError(null)
        seedPresence(page.items.flatMap((c) => (c.agent ? [c.customer, c.agent] : [c.customer])))
      },
      (err: unknown) => request === latestRequest.current && setError(err instanceof Error ? err.message : String(err)),
    )
  }, [filtersKey, seedPresence])

  useEffect(() => {
    setLoading(true)
    void reload().finally(() => setLoading(false))
  }, [reload])

  // Coalesce bursts of notifications (every message triggers one) into a single refresh.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!client) return
    const rooms = new Set([personalRoomId, staffRoomId].filter(Boolean))
    if (rooms.size === 0) return
    const off = client.onMessage((m) => {
      if (!rooms.has(m.roomId) || !conversationEventFromRealtime(m)) return
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void reload(), 400)
    })
    return () => {
      off()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [client, personalRoomId, staffRoomId, reload])

  return { data, loading, error, reload }
}
