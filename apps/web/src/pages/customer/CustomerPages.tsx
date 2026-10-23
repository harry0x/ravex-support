import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Annotation } from '../../components/brand'
import { ChatView } from '../../components/chat/ChatView'
import { ConversationListItem } from '../../components/chat/ConversationListItem'
import { Alert, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, Select, Spinner, Tabs, Textarea } from '../../components/ui'
import { useConversationList } from '../../hooks/useConversationList'
import { errorMessage } from '../../lib/format'
import { api } from '../../services/api'
import { useCurrentUser } from '../../stores/auth'
import type { ConversationStatus, Department } from '../../types/api'

function NewConversationForm() {
  const navigate = useNavigate()
  const [departments, setDepartments] = useState<Department[]>([])
  const [subject, setSubject] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.departments.list().then(setDepartments, () => undefined)
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const conversation = await api.conversations.create({ subject, message, departmentId: departmentId || undefined })
      navigate(`/chat/${conversation.id}`)
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <Card className="self-start">
      <CardHeader index={1} title="New conversation" />
      <form onSubmit={submit} className="space-y-5 p-5">
        <Field label="Subject">
          <Input required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What do you need help with?" />
        </Field>
        <Field label="Department">
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">Not sure</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Message">
          <Textarea required rows={5} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe the problem…" />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Starting…' : 'Start conversation'}
        </Button>
      </form>
    </Card>
  )
}

type StatusTab = 'ALL' | ConversationStatus

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CLOSED', label: 'Closed' },
]

export function CustomerDashboardPage() {
  const me = useCurrentUser()
  const [status, setStatus] = useState<StatusTab>('ALL')
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useConversationList({ status: status === 'ALL' ? undefined : status, page, limit: 10 })

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <PageHeader
        eyebrow={
          <>
            <Annotation k="Desk" v="customer" />
            <Annotation k="N" v={data?.total ?? '…'} />
          </>
        }
        title={`Hello, ${me.name.split(' ')[0]}.`}
        aside="How can we help?"
        description="Start a conversation and an agent will join you live. You'll see when they're online, typing, and when they've read your messages."
      />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[380px_minmax(0,1fr)]">
        <NewConversationForm />
        {/* On phones, returning customers see their conversations before the form. */}
        <Card className={data?.total ? 'order-first lg:order-none' : undefined}>
          <CardHeader index={2} title="Your conversations" />
          <div className="border-b border-line px-5">
            <Tabs
              value={status}
              options={STATUS_TABS}
              onChange={(value) => {
                setStatus(value)
                setPage(1)
              }}
            />
          </div>
          {loading && !data ? (
            <Spinner />
          ) : error ? (
            <ErrorState message={error} onRetry={() => void reload()} />
          ) : data && data.items.length > 0 ? (
            <>
              {data.items.map((c) => (
                <ConversationListItem key={c.id} conversation={c} to={`/chat/${c.id}`} viewerIsCustomer />
              ))}
              <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />
            </>
          ) : (
            <EmptyState title="No conversations yet" description="Start one with the form, and an agent will be with you shortly." />
          )}
        </Card>
      </div>
    </div>
  )
}

export function CustomerChatPage() {
  const { conversationId = '' } = useParams()
  const { data } = useConversationList({ limit: 50 })

  return (
    <div className="flex h-full">
      <aside className="scrollbar-thin hidden w-[340px] shrink-0 overflow-y-auto border-r border-line bg-surface md:block">
        <div className="flex h-12 items-center border-b border-line px-5">
          <span className="annot">
            <span className="text-plum-500">{String(data?.total ?? 0).padStart(2, '0')} / </span>Conversations
          </span>
        </div>
        {data?.items.map((c) => <ConversationListItem key={c.id} conversation={c} to={`/chat/${c.id}`} viewerIsCustomer />)}
      </aside>
      <section className="min-w-0 flex-1">
        <ChatView
          key={conversationId}
          back={{ to: '/dashboard', label: 'My conversations', hideFrom: 'md' }}
          conversationId={conversationId}
          renderActions={(chat) =>
            chat.conversation && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  void chat
                    .updateConversation(() =>
                      api.conversations.update(conversationId, { status: chat.conversation?.status === 'CLOSED' ? 'OPEN' : 'CLOSED' }),
                    )
                    .catch((err: unknown) => alert(errorMessage(err)))
                }
              >
                {chat.conversation.status === 'CLOSED' ? 'Reopen' : 'Close conversation'}
              </Button>
            )
          }
        />
      </section>
    </div>
  )
}
