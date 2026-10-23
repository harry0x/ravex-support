import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth, useCurrentUser } from '../../stores/auth'
import { useRealtime, type ConnectionState } from '../../stores/realtime'
import type { Role } from '../../types/api'
import { GridBackdrop, Wordmark } from '../brand'
import { Avatar, ThemeToggle, cx } from '../ui'

const NAV: Record<Role, { to: string; label: string; end?: boolean }[]> = {
  CUSTOMER: [
    { to: '/dashboard', label: 'My conversations' },
    { to: '/profile', label: 'Profile' },
  ],
  AGENT: [
    { to: '/agent/dashboard', label: 'Dashboard' },
    { to: '/agent/conversations', label: 'Conversations' },
    { to: '/agent/profile', label: 'Profile' },
  ],
  ADMIN: [
    { to: '/admin', label: 'Overview', end: true },
    { to: '/admin/conversations', label: 'Conversations' },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/agents', label: 'Agents' },
    { to: '/admin/departments', label: 'Departments' },
    { to: '/admin/profile', label: 'Profile' },
  ],
}

/**
 * The dock needs room for every nav item, so the breakpoint where it replaces the MENU button
 * depends on how many items the role has (static strings so Tailwind can see them).
 */
const BREAKPOINT: Record<Role, { show: string; hide: string; name: string }> = {
  CUSTOMER: { show: 'lg:flex', hide: 'lg:hidden', name: 'xl:flex' },
  AGENT: { show: 'lg:flex', hide: 'lg:hidden', name: 'xl:flex' },
  ADMIN: { show: 'xl:flex', hide: 'xl:hidden', name: '2xl:flex' },
}

const CONNECTION: Record<ConnectionState, { label: string; dot: string }> = {
  idle: { label: 'Offline', dot: 'bg-mute' },
  connecting: { label: 'Connecting', dot: 'bg-caution' },
  connected: { label: 'Live', dot: 'bg-signal live-pulse' },
  reconnecting: { label: 'Reconnecting', dot: 'bg-caution' },
  error: { label: 'Connection error', dot: 'bg-danger' },
}

export function ConnectionStatus({ tone = 'ink' }: { tone?: 'ink' | 'paper' }) {
  const { connection, connectionError } = useRealtime()
  const { label, dot } = CONNECTION[connection]
  return (
    <span
      className={cx('inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.1em]', tone === 'paper' ? 'text-paper/70' : 'text-graphite')}
      title={connectionError ?? undefined}
      role="status"
    >
      <span className={cx('h-2 w-2 rounded-full', dot)} />
      {label}
    </span>
  )
}

/** Full-screen black index for small screens (after Reading Stones' MENU). */
function MobileMenu({ onClose }: { onClose: () => void }) {
  const user = useCurrentUser()
  const { logout } = useAuth()
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className={cx('keep-light fixed inset-0 z-50 flex flex-col bg-ink text-paper', BREAKPOINT[user.role].hide)} role="dialog" aria-modal aria-label="Menu">
      <GridBackdrop tone="dark" cells={10} />
      <div className="relative flex items-center justify-between px-5 py-4">
        <Wordmark tone="paper" />
        <button ref={closeRef} onClick={onClose} className="rounded-full border border-paper/30 px-4 py-1.5 font-mono text-xs uppercase tracking-[0.1em]">
          Close ✕
        </button>
      </div>
      <nav className="relative flex flex-1 flex-col justify-center gap-2 px-5">
        {NAV[user.role].map((item, i) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => cx('flex items-baseline gap-4 text-4xl font-medium tracking-display', isActive ? 'text-paper' : 'text-paper/40')}
          >
            <span className="font-mono text-xs text-plum-300">{String(i + 1).padStart(2, '0')}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="relative flex items-center justify-between border-t border-paper/15 px-5 py-4">
        <span className="flex items-center gap-3">
          <Avatar name={user.name} size="sm" />
          <span className="text-sm">{user.name}</span>
        </span>
        <ThemeToggle />
        <ConnectionStatus tone="paper" />
        <button onClick={logout} className="text-sm text-paper/70 hover:text-paper">
          Log out
        </button>
      </div>
    </div>
  )
}

export function AppShell() {
  const user = useCurrentUser()
  const { logout } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const bp = BREAKPOINT[user.role]
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  useEffect(() => setMenuOpen(false), [location.pathname])

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <header className="relative z-20 flex shrink-0 items-center gap-6 border-b border-line bg-paper/90 px-5 py-3 backdrop-blur md:px-6">
        <NavLink to="/" className="shrink-0" aria-label="Home">
          <Wordmark />
        </NavLink>

        {/* Black pill dock: the active item is an inverted paper pill. */}
        <nav className={cx('mx-auto hidden items-center gap-1 rounded-full bg-ink p-1.5 shadow-[0_6px_24px_-12px_rgba(5,5,5,0.6)]', bp.show)} aria-label="Main">
          {NAV[user.role].map((item, i) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx(
                  'flex items-baseline gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors',
                  isActive ? 'bg-paper font-medium text-ink' : 'text-paper/60 hover:text-paper',
                )
              }
            >
              <span className="font-mono text-[9.5px] opacity-50">{String(i + 1).padStart(2, '0')}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={cx('ml-auto hidden shrink-0 items-center gap-4', bp.show)}>
          <ThemeToggle />
          <ConnectionStatus />
          <span className="h-5 w-px bg-line" />
          <span className="flex items-center gap-2.5">
            <Avatar name={user.name} size="sm" />
            <span className={cx('hidden flex-col leading-tight', bp.name)}>
              <span className="text-sm font-medium text-ink">{user.name}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute">{user.role.toLowerCase()}</span>
            </span>
          </span>
          <button onClick={logout} className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute hover:text-ink">
            Log out
          </button>
        </div>

        <button
          onClick={() => setMenuOpen(true)}
          className={cx('ml-auto flex items-center gap-2 rounded-full bg-ink px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] text-paper', bp.hide)}
          aria-label="Open menu"
        >
          Menu <span className="tracking-[0.3em]">••</span>
        </button>
      </header>
      {menuOpen && <MobileMenu onClose={closeMenu} />}
      <main className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
