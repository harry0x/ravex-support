import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router'
import { GridBackdrop, RavenMark, Ruler } from './components/brand'
import { AppShell } from './components/layout/AppShell'
import { Spinner } from './components/ui'
import { AdminAgentsPage, AdminConversationsPage, AdminDashboardPage, AdminDepartmentsPage, AdminUsersPage } from './pages/admin/AdminPages'
import { AgentConversationsPage, AgentDashboardPage, StaffConversationPage } from './pages/agent/AgentPages'
import { LoginPage, RegisterPage } from './pages/auth/AuthPages'
import { LandingPage } from './pages/landing/LandingPage'
import { CustomerChatPage, CustomerDashboardPage } from './pages/customer/CustomerPages'
import { ProfilePage } from './pages/shared/ProfilePage'
import { AuthProvider, homePathFor, postAuthPath, useAuth } from './stores/auth'
import { RealtimeProvider } from './stores/realtime'
import type { Role } from './types/api'

/** Signed-in users with one of `roles` only. The server enforces the same rules on every request. */
function RequireRole({ roles }: { roles: Role[] }) {
  const { user, restoring } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (restoring) return <Spinner label="Restoring session" />
  if (!roles.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />
  return <Outlet />
}

function GuestOnly() {
  const { user } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  return user ? <Navigate to={postAuthPath(user.role, from)} replace /> : <Outlet />
}

/** Signed-in users go to their portal; everyone else sees the landing page. */
function Home() {
  const { user } = useAuth()
  return user ? <Navigate to={homePathFor(user.role)} replace /> : <LandingPage />
}

function NotFound() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-6 overflow-hidden bg-paper px-6 text-center">
      <GridBackdrop />
      <RavenMark tone="plum" className="relative h-24 w-auto animate-float" />
      <p className="relative text-[clamp(3rem,10vw,7rem)] font-bold leading-none tracking-display">404</p>
      <Ruler className="relative w-full max-w-md" label="Page not found" />
      <a href="/" className="relative font-mono text-xs uppercase tracking-[0.1em] text-ink underline decoration-plum-300 underline-offset-4">
        Go home →
      </a>
    </main>
  )
}

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  // Guards wrap the shell: it needs a signed-in user.
  {
    element: <RequireRole roles={['CUSTOMER']} />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/dashboard', element: <CustomerDashboardPage /> },
          { path: '/chat/:conversationId', element: <CustomerChatPage /> },
          { path: '/profile', element: <ProfilePage /> },
        ],
      },
    ],
  },
  {
    element: <RequireRole roles={['AGENT']} />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/agent/dashboard', element: <AgentDashboardPage /> },
          { path: '/agent/conversations', element: <AgentConversationsPage /> },
          { path: '/agent/conversations/:id', element: <StaffConversationPage /> },
          { path: '/agent/profile', element: <ProfilePage /> },
        ],
      },
    ],
  },
  {
    element: <RequireRole roles={['ADMIN']} />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/admin', element: <AdminDashboardPage /> },
          { path: '/admin/users', element: <AdminUsersPage /> },
          { path: '/admin/agents', element: <AdminAgentsPage /> },
          { path: '/admin/conversations', element: <AdminConversationsPage /> },
          { path: '/admin/conversations/:id', element: <StaffConversationPage /> },
          { path: '/admin/departments', element: <AdminDepartmentsPage /> },
          { path: '/admin/profile', element: <ProfilePage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFound /> },
])

export default function App() {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <RouterProvider router={router} />
      </RealtimeProvider>
    </AuthProvider>
  )
}
