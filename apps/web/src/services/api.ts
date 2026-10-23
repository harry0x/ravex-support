import { config } from '../config/env'
import type {
  ActivityItem,
  Agent,
  Attachment,
  AuthResult,
  Conversation,
  ConversationStatus,
  Department,
  Message,
  MessagePage,
  Page,
  Priority,
  Role,
  Stats,
  User,
  AccountStatus,
} from '../types/api'

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; message: string; error: string; details?: { path: string; message: string }[] }

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message)
  }
}

let authToken: string | null = null
let onUnauthorized: (() => void) | null = null

/** Set by the auth store: the token to send, and what to do when the server rejects it. */
export function configureApiAuth(token: string | null, handleUnauthorized: (() => void) | null): void {
  authToken = token
  onUnauthorized = handleUnauthorized
}

type Query = Record<string, string | number | undefined | null>

function toQuery(query?: Query): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

async function request<T>(path: string, options: { method?: string; body?: unknown; query?: Query; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (authToken) headers.Authorization = `Bearer ${authToken}`

  let res: Response
  try {
    res = await fetch(`${config.apiUrl}${path}${toQuery(options.query)}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    })
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection.', 'NETWORK_ERROR', 0)
  }

  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null
  if (!body) throw new ApiError(`Request failed (${res.status})`, 'BAD_RESPONSE', res.status)
  if (!body.success) {
    // An invalid token or a disabled account ends the session everywhere.
    if (authToken && (res.status === 401 || body.error === 'ACCOUNT_DISABLED')) onUnauthorized?.()
    throw new ApiError(body.details?.[0]?.message ?? body.message, body.error, res.status)
  }
  return body.data
}

const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body })
const patch = <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body })

export interface ConversationFilters {
  page?: number
  limit?: number
  status?: ConversationStatus
  assigned?: 'me' | 'unassigned'
  q?: string
}

export const api = {
  auth: {
    register: (input: { name: string; email: string; password: string }) => post<AuthResult>('/auth/register', input),
    login: (input: { email: string; password: string }) => post<AuthResult>('/auth/login', input),
    logout: () => post<null>('/auth/logout'),
    me: () => request<{ user: User }>('/auth/me'),
  },
  conversations: {
    list: (filters: ConversationFilters = {}) => request<Page<Conversation>>('/conversations', { query: { ...filters } }),
    get: (id: string) => request<Conversation>(`/conversations/${id}`),
    create: (input: { subject: string; message: string; departmentId?: string }) => post<Conversation>('/conversations', input),
    update: (id: string, input: { status?: ConversationStatus; priority?: Priority; departmentId?: string | null }) =>
      patch<Conversation>(`/conversations/${id}`, input),
    assign: (id: string, agentId?: string | null) =>
      post<Conversation>(`/conversations/${id}/assign`, agentId === undefined ? {} : { agentId }),
    messages: (id: string, query: { before?: string; limit?: number } = {}) =>
      request<MessagePage>(`/conversations/${id}/messages`, { query }),
    send: (id: string, input: { content?: string; attachmentIds?: string[] }) => post<Message>(`/conversations/${id}/messages`, input),
  },
  uploads: {
    create: (conversationId: string, file: File) => {
      const form = new FormData()
      form.set('conversationId', conversationId)
      form.set('file', file)
      return request<Attachment>('/uploads', { method: 'POST', form })
    },
  },
  departments: {
    list: () => request<Department[]>('/departments'),
    create: (input: { name: string; description?: string | null }) => post<Department>('/departments', input),
    update: (id: string, input: { name?: string; description?: string | null; isActive?: boolean }) =>
      patch<Department>(`/departments/${id}`, input),
    remove: (id: string) => request<null>(`/departments/${id}`, { method: 'DELETE' }),
  },
  users: {
    list: (query: { page?: number; role?: Role; status?: AccountStatus; q?: string } = {}) =>
      request<Page<User>>('/users', { query }),
    create: (input: { name: string; email: string; password: string; role: Role }) => post<User>('/users', input),
    update: (id: string, input: { name?: string; role?: Role; status?: AccountStatus }) => patch<User>(`/users/${id}`, input),
  },
  agents: {
    list: () => request<Agent[]>('/agents'),
  },
  admin: {
    stats: () => request<Stats>('/admin/stats'),
    activity: () => request<ActivityItem[]>('/admin/activity'),
  },
}
