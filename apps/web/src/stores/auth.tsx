import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError, configureApiAuth } from '../services/api'
import type { AuthResult, Role, User } from '../types/api'

const STORAGE_KEY = 'ravex-support-auth'

interface AuthContextValue {
  user: User | null
  token: string | null
  /** True until a stored session has been re-validated with the server. */
  restoring: boolean
  login(email: string, password: string): Promise<User>
  register(name: string, email: string, password: string): Promise<User>
  logout(): void
  setUser(user: User): void
  /**
   * Re-reads the user from the server (role or status may have changed). Resolves true if the
   * session is still valid; signs out and resolves false if not.
   */
  refresh(): Promise<boolean>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readStored(): AuthResult | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AuthResult) : null
  } catch {
    return null
  }
}

function writeStored(session: AuthResult | null): void {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable (private mode): the session just won't survive a reload.
  }
}

/** After signing in: back to the page that required it if it belongs to the role, else home. */
export function postAuthPath(role: Role, from?: string | null): string {
  const allowed =
    from && from !== '/' && (role === 'ADMIN' ? from.startsWith('/admin') : role === 'AGENT' ? from.startsWith('/agent') : !from.startsWith('/agent') && !from.startsWith('/admin'))
  return allowed ? from : homePathFor(role)
}

export function homePathFor(role: Role): string {
  if (role === 'ADMIN') return '/admin'
  if (role === 'AGENT') return '/agent/dashboard'
  return '/dashboard'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthResult | null>(readStored)
  const [restoring, setRestoring] = useState(() => session !== null)

  const update = useCallback((next: AuthResult | null) => {
    writeStored(next)
    setSession(next)
  }, [])

  const logout = useCallback(() => {
    if (session) void api.auth.logout().catch(() => undefined)
    update(null)
  }, [session, update])

  // Keep the API client's token in sync; a 401 anywhere ends the session.
  const token = session?.token ?? null
  configureApiAuth(token, () => update(null))

  // Re-validate a stored session (role or status may have changed since).
  useEffect(() => {
    if (!token) return
    let cancelled = false
    api.auth
      .me()
      .then(({ user }) => !cancelled && update({ token, user }))
      .catch((err: unknown) => {
        if (!cancelled && err instanceof ApiError && (err.status === 401 || err.status === 403)) update(null)
      })
      .finally(() => !cancelled && setRestoring(false))
    return () => {
      cancelled = true
    }
    // Only when the token changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      token,
      restoring,
      async login(email, password) {
        const result = await api.auth.login({ email, password })
        setRestoring(false)
        update(result)
        return result.user
      },
      async register(name, email, password) {
        const result = await api.auth.register({ name, email, password })
        setRestoring(false)
        update(result)
        return result.user
      },
      logout,
      setUser(user) {
        if (token) update({ token, user })
      },
      async refresh() {
        if (!token) return false
        try {
          const { user } = await api.auth.me()
          update({ token, user })
          return true
        } catch (err) {
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            update(null)
            return false
          }
          return true // network trouble: keep the session, the socket will retry
        }
      },
    }),
    [session, token, restoring, logout, update],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** For components rendered behind a signed-in route guard. */
export function useCurrentUser(): User {
  const { user } = useAuth()
  if (!user) throw new Error('useCurrentUser requires a signed-in user')
  return user
}
