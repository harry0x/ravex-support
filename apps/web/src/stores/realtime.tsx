import { ChatClient } from '@ravex/client'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { config } from '../config/env'
import type { Presence } from '../types/api'
import { useAuth } from './auth'

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

interface RealtimeContextValue {
  client: ChatClient | null
  connection: ConnectionState
  connectionError: string | null
  /** Logical room key (e.g. `conversation:<id>`) → the Ravex room id it is currently joined as. */
  roomIds: Record<string, string>
  roomErrors: Record<string, string>
  acquireRoom(key: string): void
  releaseRoom(key: string): void
  presence: Record<string, Presence>
  seedPresence(entries: { id: string; presence: Presence }[]): void
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null)

const ACTIVITY_PING_MS = 60_000

/**
 * One Ravex connection per signed-in session. Rooms are reference-counted so several components
 * can share one, and are re-joined after every reconnect (Ravex keeps rooms in memory only, so
 * after a server restart they come back with new ids).
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { token, refresh } = useAuth()
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const [client, setClient] = useState<ChatClient | null>(null)
  const [connection, setConnection] = useState<ConnectionState>('idle')
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [roomIds, setRoomIds] = useState<Record<string, string>>({})
  const [roomErrors, setRoomErrors] = useState<Record<string, string>>({})
  const [presence, setPresence] = useState<Record<string, Presence>>({})
  const refCounts = useRef(new Map<string, number>())
  const roomIdsRef = useRef(roomIds)
  roomIdsRef.current = roomIds

  const join = useCallback((c: ChatClient, key: string) => {
    c.joinRoom(key).then(
      (room) => {
        // Released while the join was in flight: leave again so this socket doesn't stay subscribed.
        if ((refCounts.current.get(key) ?? 0) === 0) {
          void c.leaveRoom(key).catch(() => undefined)
          return
        }
        setRoomIds((prev) => ({ ...prev, [key]: room.id }))
        setRoomErrors(({ [key]: _, ...rest }) => rest)
      },
      (err: unknown) => {
        if ((refCounts.current.get(key) ?? 0) === 0) return
        setRoomErrors((prev) => ({ ...prev, [key]: err instanceof Error ? err.message : String(err) }))
      },
    )
  }, [])

  useEffect(() => {
    if (!token) {
      setClient(null)
      setConnection('idle')
      return
    }
    const c = new ChatClient({ url: config.ravexUrl, auth: { token }, autoConnect: false })
    const socket = c.rawSocket
    setClient(c)
    setConnection('connecting')

    socket.on('connect', () => {
      setConnection('connected')
      setConnectionError(null)
      c.setStatus(document.visibilityState === 'hidden' ? 'away' : 'online')
      for (const [key, count] of refCounts.current) if (count > 0) join(c, key)
    })
    socket.on('disconnect', (reason) => {
      setRoomIds({})
      if (reason === 'io client disconnect') {
        setConnection('idle')
        return
      }
      setConnection('reconnecting')
      // The server ended the session (account disabled or role changed). socket.io won't retry on
      // its own: re-check the account, then reconnect with the current role, or sign out.
      if (reason === 'io server disconnect') {
        void refreshRef.current().then((valid) => valid && c.connect())
      }
    })
    socket.on('connect_error', (err) => {
      setConnection('error')
      setConnectionError(err.message)
    })

    const offs = [
      c.onUserOnline(({ id }) => setPresence((p) => ({ ...p, [id]: 'online' }))),
      c.onUserOffline(({ id }) => setPresence((p) => ({ ...p, [id]: 'offline' }))),
      c.onUserStatus(({ id, status }) => setPresence((p) => ({ ...p, [id]: status }))),
      c.onKickedFromRoom(({ roomId, reason }) => {
        const key = Object.entries(roomIdsRef.current).find(([, id]) => id === roomId)?.[0]
        if (!key) return
        setRoomIds(({ [key]: _, ...rest }) => rest)
        setRoomErrors((prev) => ({ ...prev, [key]: reason }))
      }),
    ]

    // Presence: away while the tab is hidden; pings on activity keep Ravex's away timer reset.
    let lastPing = 0
    const onVisibility = () => c.isConnected && c.setStatus(document.visibilityState === 'hidden' ? 'away' : 'online')
    const onActivity = () => {
      const now = Date.now()
      if (c.isConnected && now - lastPing > ACTIVITY_PING_MS) {
        lastPing = now
        c.ping()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pointerdown', onActivity)
    window.addEventListener('keydown', onActivity)

    c.connect()

    return () => {
      offs.forEach((off) => off())
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pointerdown', onActivity)
      window.removeEventListener('keydown', onActivity)
      socket.removeAllListeners()
      c.disconnect()
      setRoomIds({})
      setRoomErrors({})
      setPresence({})
    }
  }, [token, join])

  const acquireRoom = useCallback(
    (key: string) => {
      const count = (refCounts.current.get(key) ?? 0) + 1
      refCounts.current.set(key, count)
      if (count === 1 && client?.isConnected) join(client, key)
    },
    [client, join],
  )

  const releaseRoom = useCallback(
    (key: string) => {
      const count = (refCounts.current.get(key) ?? 0) - 1
      if (count > 0) {
        refCounts.current.set(key, count)
        return
      }
      refCounts.current.delete(key)
      if (roomIdsRef.current[key] && client?.isConnected) void client.leaveRoom(key).catch(() => undefined)
      setRoomIds(({ [key]: _, ...rest }) => rest)
      setRoomErrors(({ [key]: _, ...rest }) => rest)
    },
    [client],
  )

  const seedPresence = useCallback((entries: { id: string; presence: Presence }[]) => {
    setPresence((prev) => {
      const next = { ...prev }
      for (const e of entries) if (!(e.id in next)) next[e.id] = e.presence
      return next
    })
  }, [])

  const value = useMemo<RealtimeContextValue>(
    () => ({ client, connection, connectionError, roomIds, roomErrors, acquireRoom, releaseRoom, presence, seedPresence }),
    [client, connection, connectionError, roomIds, roomErrors, acquireRoom, releaseRoom, presence, seedPresence],
  )
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime must be used inside <RealtimeProvider>')
  return ctx
}

/** Joins a logical room while the component is mounted. Returns its Ravex id once joined. */
export function useRoom(key: string | null): { roomId: string | null; error: string | null } {
  const { acquireRoom, releaseRoom, roomIds, roomErrors } = useRealtime()
  useEffect(() => {
    if (!key) return
    acquireRoom(key)
    return () => releaseRoom(key)
  }, [key, acquireRoom, releaseRoom])
  return { roomId: key ? (roomIds[key] ?? null) : null, error: key ? (roomErrors[key] ?? null) : null }
}

/** Live presence for a user, falling back to the value the REST API reported. */
export function usePresence(userId: string | undefined, fallback: Presence = 'offline'): Presence {
  const { presence } = useRealtime()
  return (userId && presence[userId]) || fallback
}
