import { useEffect, useState } from 'react'
import { errorMessage } from '../../lib/format'
import { api } from '../../services/api'
import { useCurrentUser } from '../../stores/auth'
import type { Agent, ConversationStatus, Department, Priority } from '../../types/api'
import { Button, Select } from '../ui'
import type { ChatState } from './ChatView'

const STATUSES: ConversationStatus[] = ['OPEN', 'PENDING', 'CLOSED']
const PRIORITIES: Priority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT']

/** Header controls for agents and admins: accept, status, priority, department, assignment. */
export function StaffActions({ chat }: { chat: ChatState }) {
  const me = useCurrentUser()
  const [departments, setDepartments] = useState<Department[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [accepting, setAccepting] = useState(false)
  const conversation = chat.conversation

  useEffect(() => {
    api.departments.list().then(setDepartments, () => undefined)
    if (me.role === 'ADMIN') api.agents.list().then(setAgents, () => undefined)
  }, [me.role])

  if (!conversation) return null
  const id = conversation.id
  // Field changes always go through (out-of-order responses are handled by the chat hook);
  // only Accept is guarded against double clicks.
  const run = (change: () => ReturnType<typeof api.conversations.get>) =>
    chat.updateConversation(change).catch((err: unknown) => alert(errorMessage(err)))
  const accept = () => {
    if (accepting) return
    setAccepting(true)
    void run(() => api.conversations.assign(id)).finally(() => setAccepting(false))
  }

  const isAdmin = me.role === 'ADMIN'
  const assignedToMe = conversation.agent?.id === me.id
  const canEdit = isAdmin || assignedToMe
  const select = 'w-auto! rounded-full! py-1.5 pl-3 text-xs'

  return (
    <>
      {me.role === 'AGENT' && !conversation.agent && conversation.status !== 'CLOSED' && (
        <Button size="sm" disabled={accepting} onClick={accept}>
          {accepting ? 'Accepting…' : 'Accept conversation'}
        </Button>
      )}
      {isAdmin && conversation.status !== 'CLOSED' && (
        <Select
          aria-label="Assigned agent"
          className={select}
          value={conversation.agent?.id ?? ''}
          onChange={(e) => void run(() => api.conversations.assign(id, e.target.value || null))}
        >
          <option value="">Unassigned</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.openConversations} open)
            </option>
          ))}
        </Select>
      )}
      {canEdit && (
        <>
          <Select aria-label="Status" className={select} value={conversation.status} onChange={(e) => void run(() => api.conversations.update(id, { status: e.target.value as ConversationStatus }))}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase()}
              </option>
            ))}
          </Select>
          <Select aria-label="Priority" className={select} value={conversation.priority} onChange={(e) => void run(() => api.conversations.update(id, { priority: e.target.value as Priority }))}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p.toLowerCase()} priority
              </option>
            ))}
          </Select>
          <Select
            aria-label="Department"
            className={select}
            value={conversation.department?.id ?? ''}
            onChange={(e) => void run(() => api.conversations.update(id, { departmentId: e.target.value || null }))}
          >
            <option value="">No department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </>
      )}
    </>
  )
}
