import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Annotation } from '../../components/brand'
import { ChatView } from '../../components/chat/ChatView'
import { ConversationListItem } from '../../components/chat/ConversationListItem'
import { StaffActions } from '../../components/chat/StaffActions'
import { Avatar, Button, Card, CardHeader, EmptyState, ErrorState, Input, Metric, MetricGrid, PageHeader, Pagination, Select, Spinner, Tabs } from '../../components/ui'
import { useConversationList } from '../../hooks/useConversationList'
import { errorMessage, timeAgo } from '../../lib/format'
import { api } from '../../services/api'
import { useCurrentUser } from '../../stores/auth'
import type { Conversation, ConversationStatus } from '../../types/api'

/** Where a staff member opens a conversation: admins under /admin, agents under /agent. */
export function useConversationPath() {
  const me = useCurrentUser()
  return (id: string) => (me.role === 'ADMIN' ? `/admin/conversations/${id}` : `/agent/conversations/${id}`)
}

function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

type Scope = 'all' | 'me' | 'unassigned'

/** Searchable, filterable, paginated list of the conversations a staff member can see. */
export function ConversationBrowser({ title, aside, description }: { title: string; aside?: string; description: string }) {
  const me = useCurrentUser()
  const pathFor = useConversationPath()
  const [scope, setScope] = useState<Scope>(me.role === 'AGENT' ? 'me' : 'all')
  const [status, setStatus] = useState<ConversationStatus | ''>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const q = useDebounced(search.trim())

  useEffect(() => setPage(1), [scope, status, q])
  const { data, loading, error, reload } = useConversationList({
    page,
    limit: 20,
    status: status || undefined,
    assigned: scope === 'all' ? undefined : scope,
    q: q || undefined,
  })

  const scopes: { value: Scope; label: string }[] =
    me.role === 'AGENT'
      ? [
          { value: 'me', label: 'Assigned to me' },
          { value: 'unassigned', label: 'Queue' },
          { value: 'all', label: 'All I can see' },
        ]
      : [
          { value: 'all', label: 'All' },
          { value: 'unassigned', label: 'Unassigned' },
        ]

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <PageHeader
        eyebrow={
          <>
            <Annotation k="View" v={scopes.find((s) => s.value === scope)?.label ?? scope} />
            <Annotation k="N" v={data?.total ?? '…'} />
            {q && <Annotation k="Q" v={`“${q}”`} />}
          </>
        }
        title={title}
        aside={aside}
        description={description}
      />
      <Card>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-line px-5">
          <Tabs value={scope} options={scopes} onChange={setScope} />
          <div className="ml-auto flex w-full flex-wrap items-center gap-2 pb-3 sm:w-auto sm:pt-3">
            <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as ConversationStatus | '')} className="w-36 py-2">
              <option value="">Any status</option>
              <option value="OPEN">Open</option>
              <option value="PENDING">Pending</option>
              <option value="CLOSED">Closed</option>
            </Select>
            <Input
              type="search"
              aria-label="Search"
              placeholder="Search customer, email, subject, messages…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 py-2 sm:w-80"
            />
          </div>
        </div>
        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void reload()} />
        ) : data && data.items.length > 0 ? (
          <>
            {data.items.map((c) => (
              <ConversationListItem key={c.id} conversation={c} to={pathFor(c.id)} viewerIsCustomer={false} />
            ))}
            <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />
          </>
        ) : (
          <EmptyState title="Nothing here" description={q ? `No conversations match “${q}”.` : 'No conversations in this view.'} />
        )}
      </Card>
    </div>
  )
}

function QueueRow({ conversation, index }: { conversation: Conversation; index: number }) {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)
  return (
    <div className="group flex items-center gap-4 border-b border-line px-5 py-4 last:border-0 hover:bg-paper-2/60">
      <span className="font-mono text-[11px] text-mute">{String(index + 1).padStart(2, '0')}</span>
      <Avatar name={conversation.customer.name} presence={conversation.customer.presence} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium tracking-tight text-ink">{conversation.subject}</p>
        <p className="truncate font-mono text-[10.5px] uppercase tracking-[0.06em] text-mute">
          {conversation.customer.name}
          {conversation.department && ` / ${conversation.department.name}`} · waiting {timeAgo(conversation.createdAt)}
        </p>
        <p className="mt-1 truncate text-sm text-graphite">{conversation.lastMessage?.content}</p>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
      <Button
        size="sm"
        disabled={accepting}
        onClick={() => {
          setAccepting(true)
          api.conversations.assign(conversation.id).then(
            () => navigate(`/agent/conversations/${conversation.id}`),
            (err: unknown) => {
              setError(errorMessage(err))
              setAccepting(false)
            },
          )
        }}
      >
        {accepting ? 'Accepting…' : 'Accept'}
      </Button>
    </div>
  )
}

export function AgentDashboardPage() {
  const me = useCurrentUser()
  const mine = useConversationList({ assigned: 'me', status: 'OPEN', limit: 5 })
  const pending = useConversationList({ assigned: 'me', status: 'PENDING', limit: 1 })
  const queue = useConversationList({ assigned: 'unassigned', status: 'OPEN', limit: 10 })

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <PageHeader
        eyebrow={
          <>
            <Annotation k="Desk" v="agent" />
            <Annotation k="Queue" v={queue.data?.total ?? '…'} />
          </>
        }
        title={`Hi, ${me.name.split(' ')[0]}.`}
        aside={queue.data?.total ? `${queue.data.total} waiting in the queue.` : 'The queue is clear.'}
      />
      <MetricGrid className="mb-8 sm:grid-cols-3">
        <Metric label="01 / My open conversations" value={mine.data?.total} />
        <Metric label="02 / Waiting on customer" value={pending.data?.total} />
        <Metric label="03 / Unassigned queue" value={queue.data?.total} accent />
      </MetricGrid>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader index={1} title="Queue · live" />
          {queue.loading && !queue.data ? (
            <Spinner />
          ) : queue.data?.items.length ? (
            queue.data.items.map((c, i) => <QueueRow key={c.id} conversation={c} index={i} />)
          ) : (
            <EmptyState title="The queue is empty" description="New conversations appear here the moment a customer opens one." />
          )}
        </Card>
        <Card>
          <CardHeader index={2} title="My active conversations" action={<Link to="/agent/conversations" className="annot hover:text-ink">View all →</Link>} />
          {mine.loading && !mine.data ? (
            <Spinner />
          ) : mine.data?.items.length ? (
            mine.data.items.map((c) => <ConversationListItem key={c.id} conversation={c} to={`/agent/conversations/${c.id}`} viewerIsCustomer={false} />)
          ) : (
            <EmptyState title="No active conversations" description="Accept one from the queue to get started." />
          )}
        </Card>
      </div>
    </div>
  )
}

export function AgentConversationsPage() {
  return <ConversationBrowser title="Conversations" aside="Yours, and the queue." description="Search across customers, emails, subjects and message content." />
}

/** Conversation view for agents and admins, with a sidebar of open conversations. */
export function StaffConversationPage() {
  const { id = '' } = useParams()
  const me = useCurrentUser()
  const pathFor = useConversationPath()
  // Agents: everything assigned to them (pending ones stay visible). Admins: the open queue.
  const sidebar = useConversationList(me.role === 'AGENT' ? { assigned: 'me', limit: 50 } : { status: 'OPEN', limit: 50 })

  return (
    <div className="flex h-full">
      <aside className="scrollbar-thin hidden w-[340px] shrink-0 overflow-y-auto border-r border-line bg-surface lg:block">
        <div className="flex h-12 items-center border-b border-line px-5">
          <span className="annot">
            <span className="text-plum-500">{String(sidebar.data?.total ?? 0).padStart(2, '0')} / </span>
            {me.role === 'AGENT' ? 'My conversations' : 'Open conversations'}
          </span>
        </div>
        {sidebar.data?.items.map((c) => <ConversationListItem key={c.id} conversation={c} to={pathFor(c.id)} viewerIsCustomer={false} />)}
        {sidebar.data?.items.length === 0 && <EmptyState title="None open" />}
      </aside>
      <section className="min-w-0 flex-1">
        <ChatView
          key={id}
          conversationId={id}
          back={{ to: me.role === 'ADMIN' ? '/admin/conversations' : '/agent/conversations', label: 'Conversations', hideFrom: 'lg' }}
          renderActions={(chat) => <StaffActions chat={chat} />}
        />
      </section>
    </div>
  )
}
