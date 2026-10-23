import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Annotation, GridBackdrop, RavenMark } from '../../components/brand'
import { DailyColumnChart, SplitBar } from '../../components/ui/charts'
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Metric,
  MetricGrid,
  PageHeader,
  Pagination,
  Select,
  Spinner,
} from '../../components/ui'
import { errorMessage, timeAgo } from '../../lib/format'
import { api } from '../../services/api'
import { useCurrentUser } from '../../stores/auth'
import { usePresence } from '../../stores/realtime'
import type { AccountStatus, ActivityItem, Agent, Department, Page, Role, Stats, User } from '../../types/api'
import { ConversationBrowser } from '../agent/AgentPages'

/** Loads data with loading/error state and a reload function. */
function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(
    () =>
      load()
        .then(
          (value) => {
            setData(value)
            setError(null)
          },
          (err: unknown) => setError(errorMessage(err)),
        )
        .finally(() => setLoading(false)),
    deps,
  )
  useEffect(() => {
    setLoading(true)
    setError(null)
    void reload()
  }, [reload])
  return { data, error, loading, reload, setData }
}

const PAGE = 'mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14'

export function AdminDashboardPage() {
  const stats = useLoad<Stats>(() => api.admin.stats(), [])
  const activity = useLoad<ActivityItem[]>(() => api.admin.activity(), [])

  // Online-agent counts change constantly; refresh periodically rather than per event.
  useEffect(() => {
    const t = setInterval(() => void stats.reload(), 30_000)
    return () => clearInterval(t)
  }, [stats.reload])

  if (stats.loading && !stats.data) return <Spinner label="Loading dashboard" />
  // A failed background refresh keeps the last numbers on screen; only a failed first load shows the error.
  if (!stats.data) return <ErrorState message={stats.error ?? 'Could not load statistics'} onRetry={() => void stats.reload()} />
  const { totals } = stats.data
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className={PAGE}>
      <PageHeader
        eyebrow={
          <>
            <Annotation k="Date" v={today} />
            <Annotation k="Window" v="14 days" />
            <Annotation k="Online" v={`${totals.onlineAgents} / ${totals.agents} agents`} />
          </>
        }
        title="Overview"
        aside="of the support desk."
      />
      <MetricGrid className="grid-cols-2 lg:grid-cols-4">
        <Metric label="01 / Total customers" value={totals.customers} />
        <Metric label="02 / Total agents" value={totals.agents} hint={`${totals.onlineAgents} online now`} />
        <Metric label="03 / Online agents" value={totals.onlineAgents} accent />
        <Metric label="04 / Messages today" value={totals.messagesToday} hint="UTC day, excluding system events" />
        <Metric label="05 / Open conversations" value={totals.openConversations} />
        <Metric label="06 / Pending conversations" value={totals.pendingConversations} />
        <Metric label="07 / Closed conversations" value={totals.closedConversations} />
        <div className="keep-light relative overflow-hidden bg-ink p-5 text-paper">
          <GridBackdrop tone="dark" cells={4} />
          <p className="annot relative text-paper/50!">Realtime</p>
          <RavenMark tone="plum" className="relative mt-3 h-12 w-auto" />
          <p className="relative mt-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-paper/60">powered by ravex</p>
        </div>
      </MetricGrid>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader index={1} title="Conversations" />
          <div className="p-5">
            <DailyColumnChart title="New conversations per day (last 14 days)" data={stats.data.conversationsPerDay} unit="conversations" />
          </div>
        </Card>
        <Card>
          <CardHeader index={2} title="Messages" />
          <div className="p-5">
            <DailyColumnChart title="Messages per day (last 14 days)" data={stats.data.messagesPerDay} unit="messages" />
          </div>
        </Card>
        <Card>
          <CardHeader index={3} title="Status" />
          <div className="p-5">
            <SplitBar
              title="Conversations by status"
              parts={[
                { label: 'Open', value: totals.openConversations },
                { label: 'Pending', value: totals.pendingConversations },
                { label: 'Closed', value: totals.closedConversations },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader index={4} title="Recent activity" />
          {activity.data?.length ? (
            <ol className="scrollbar-thin max-h-80 overflow-y-auto">
              {activity.data.map((item, i) => (
                <li key={item.id} className="flex items-baseline gap-4 border-b border-line px-5 py-3 text-sm last:border-0">
                  <span className="font-mono text-[10.5px] text-mute">{String(i + 1).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1 text-ink">
                    {item.conversationId ? (
                      <Link to={`/admin/conversations/${item.conversationId}`} className="hover:underline hover:decoration-plum-300 hover:underline-offset-4">
                        {item.text}
                      </Link>
                    ) : (
                      item.text
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-mute">{timeAgo(item.at)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="No activity yet" />
          )}
        </Card>
      </div>
    </div>
  )
}

export function AdminConversationsPage() {
  return <ConversationBrowser title="Conversations" aside="Every one of them." description="Search, filter, and open one to assign an agent." />
}

function CreateUserForm({ defaultRole, onCreated, index }: { defaultRole: Role; onCreated: (user: User) => void; index: number }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>(defaultRole)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      onCreated(await api.users.create({ name, email, password, role }))
      setName('')
      setEmail('')
      setPassword('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="self-start">
      <CardHeader index={index} title="Create an account" />
      <form onSubmit={submit} className="space-y-4 p-5">
        <Field label="Name">
          <Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Temporary password" hint="At least 8 characters. Share it securely.">
          <Input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="AGENT">Agent</option>
            <option value="ADMIN">Admin</option>
            <option value="CUSTOMER">Customer</option>
          </Select>
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Creating…' : 'Create account'}
        </Button>
      </form>
    </Card>
  )
}

function UserRow({ user, onChange }: { user: User; onChange: (user: User) => void }) {
  const me = useCurrentUser()
  const presence = usePresence(user.id, user.presence)
  const [error, setError] = useState<string | null>(null)
  const self = user.id === me.id
  const update = (input: { role?: Role; status?: AccountStatus }) =>
    api.users.update(user.id, input).then(onChange, (err: unknown) => setError(errorMessage(err)))

  return (
    <tr className="border-t border-line hover:bg-paper-2/50">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} presence={presence} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium tracking-tight text-ink">
              {user.name} {self && <span className="font-mono text-[10px] uppercase text-plum-500">(you)</span>}
            </p>
            <p className="truncate font-mono text-[11px] text-mute">{user.email}</p>
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        </div>
      </td>
      <td className="px-5 py-3.5">
        <Select aria-label={`Role of ${user.name}`} className="w-32 rounded-full! py-1.5 text-xs" value={user.role} disabled={self} onChange={(e) => void update({ role: e.target.value as Role })}>
          <option value="CUSTOMER">Customer</option>
          <option value="AGENT">Agent</option>
          <option value="ADMIN">Admin</option>
        </Select>
      </td>
      <td className="px-5 py-3.5">{user.status === 'ACTIVE' ? <Badge tone="green" dot>active</Badge> : <Badge tone="red" dot>disabled</Badge>}</td>
      <td className="hidden whitespace-nowrap px-5 py-3.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-mute md:table-cell">
        {presence !== 'offline' ? presence : user.lastSeenAt ? `seen ${timeAgo(user.lastSeenAt)}` : 'never'}
      </td>
      <td className="px-5 py-3.5 text-right">
        {!self && (
          <Button variant={user.status === 'ACTIVE' ? 'secondary' : 'primary'} size="sm" onClick={() => void update({ status: user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })}>
            {user.status === 'ACTIVE' ? 'Disable' : 'Enable'}
          </Button>
        )}
      </td>
    </tr>
  )
}

export function AdminUsersPage() {
  const [role, setRole] = useState<Role | ''>('')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const users = useLoad<Page<User>>(() => api.users.list({ page, role: role || undefined, q: search || undefined }), [page, role, search])

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const replace = (user: User) => users.setData((prev) => prev && { ...prev, items: prev.items.map((u) => (u.id === user.id ? user : u)) })

  return (
    <div className={PAGE}>
      <PageHeader
        eyebrow={<Annotation k="N" v={users.data?.total ?? '…'} />}
        title="Users"
        aside="Roles and access."
        description="Changing a role or disabling an account ends that person's live sessions immediately."
      />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap gap-2 border-b border-line p-4">
            <Input type="search" placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full py-2 sm:w-64" aria-label="Search users" />
            <Select
              aria-label="Filter by role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value as Role | '')
                setPage(1)
              }}
              className="w-40 py-2"
            >
              <option value="">All roles</option>
              <option value="CUSTOMER">Customers</option>
              <option value="AGENT">Agents</option>
              <option value="ADMIN">Admins</option>
            </Select>
          </div>
          {users.loading && !users.data ? (
            <Spinner />
          ) : users.error ? (
            <ErrorState message={users.error} onRetry={() => void users.reload()} />
          ) : users.data && users.data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="annot">
                    <th className="px-5 py-3 font-normal">User</th>
                    <th className="px-5 py-3 font-normal">Role</th>
                    <th className="px-5 py-3 font-normal">Account</th>
                    <th className="hidden px-5 py-3 font-normal md:table-cell">Presence</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {users.data.items.map((u) => (
                    <UserRow key={u.id} user={u} onChange={replace} />
                  ))}
                </tbody>
              </table>
              <Pagination page={users.data.page} totalPages={users.data.totalPages} onPage={setPage} />
            </div>
          ) : (
            <EmptyState title="No users found" />
          )}
        </Card>
        <CreateUserForm index={2} defaultRole="AGENT" onCreated={() => void users.reload()} />
      </div>
    </div>
  )
}

function AgentCard({ agent, index }: { agent: Agent; index: number }) {
  const presence = usePresence(agent.id, agent.presence)
  return (
    <div className="flex items-center gap-4 border-b border-line bg-surface px-5 py-4 last:border-0">
      <span className="font-mono text-[11px] text-mute">{String(index + 1).padStart(2, '0')}</span>
      <Avatar name={agent.name} presence={presence} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium tracking-tight text-ink">{agent.name}</p>
        <p className="truncate font-mono text-[11px] text-mute">{agent.email}</p>
      </div>
      <div className="text-right">
        <p className="text-3xl font-medium tabular-nums tracking-display text-ink">{agent.openConversations}</p>
        <p className="annot">open</p>
      </div>
      <span className="hidden w-20 text-right font-mono text-[10.5px] uppercase tracking-[0.06em] text-graphite sm:block">{presence}</span>
    </div>
  )
}

export function AdminAgentsPage() {
  const agents = useLoad<Agent[]>(() => api.agents.list(), [])
  const online = agents.data?.filter((a) => a.presence && a.presence !== 'offline').length
  return (
    <div className={PAGE}>
      <PageHeader eyebrow={<Annotation k="Online" v={online ?? '…'} />} title="Agents" aside="Presence and workload." />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="self-start">
          <CardHeader index={1} title="Active agents" />
          {agents.loading && !agents.data ? (
            <Spinner />
          ) : agents.error ? (
            <ErrorState message={agents.error} onRetry={() => void agents.reload()} />
          ) : agents.data?.length ? (
            agents.data.map((a, i) => <AgentCard key={a.id} agent={a} index={i} />)
          ) : (
            <EmptyState title="No agents yet" description="Create an agent account to start handling conversations." />
          )}
        </Card>
        <CreateUserForm index={2} defaultRole="AGENT" onCreated={() => void agents.reload()} />
      </div>
    </div>
  )
}

function DepartmentRow({ department, onChanged, index }: { department: Department; onChanged: () => void; index: number }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(department.name)
  const [description, setDescription] = useState(department.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const act = (fn: () => Promise<unknown>) =>
    fn().then(
      () => {
        setEditing(false)
        setError(null)
        onChanged()
      },
      (err: unknown) => setError(errorMessage(err)),
    )

  return (
    <li className="border-t border-line px-5 py-4">
      {editing ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void act(() => api.departments.update(department.id, { name, description: description || null }))
          }}
        >
          <Input aria-label="Name" required value={name} onChange={(e) => setName(e.target.value)} className="py-2 sm:w-48" />
          <Input aria-label="Description" value={description} onChange={(e) => setDescription(e.target.value)} className="flex-1 py-2" />
          <Button type="submit" size="sm">
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-mono text-[11px] text-mute">{String(index + 1).padStart(2, '0')}</span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-medium tracking-tight text-ink">
              {department.name} {!department.isActive && <Badge>inactive</Badge>}
            </p>
            {department.description && <p className="text-sm text-graphite">{department.description}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void act(() => api.departments.update(department.id, { isActive: !department.isActive }))}>
            {department.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-danger! hover:bg-danger/5!"
            onClick={() => {
              if (confirm(`Delete “${department.name}”? Its conversations keep existing without a department.`)) {
                void act(() => api.departments.remove(department.id))
              }
            }}
          >
            Delete
          </Button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </li>
  )
}

export function AdminDepartmentsPage() {
  const departments = useLoad<Department[]>(() => api.departments.list(), [])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (creating) return
    setCreating(true)
    try {
      await api.departments.create({ name, description: description || null })
      setName('')
      setDescription('')
      setError(null)
      void departments.reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <PageHeader
        eyebrow={<Annotation k="N" v={departments.data?.length ?? '…'} />}
        title="Departments"
        aside="Where questions go."
        description="Customers pick a department when they open a conversation. Inactive ones are hidden from them."
      />
      <Card>
        <CardHeader index={1} title="Add a department" />
        <form onSubmit={create} className="flex flex-wrap gap-2 p-5">
          <Input aria-label="New department name" placeholder="Name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className="sm:w-48" />
          <Input aria-label="New department description" placeholder="Description (optional)" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} className="flex-1" />
          <Button type="submit" disabled={creating}>
            {creating ? 'Adding…' : 'Add department'}
          </Button>
          {error && (
            <div className="w-full">
              <Alert>{error}</Alert>
            </div>
          )}
        </form>
        {departments.loading && !departments.data ? (
          <Spinner />
        ) : departments.error ? (
          <ErrorState message={departments.error} onRetry={() => void departments.reload()} />
        ) : departments.data?.length ? (
          <ul>
            {departments.data.map((d, i) => (
              <DepartmentRow key={d.id} department={d} index={i} onChanged={() => void departments.reload()} />
            ))}
          </ul>
        ) : (
          <EmptyState title="No departments" />
        )}
      </Card>
    </div>
  )
}
