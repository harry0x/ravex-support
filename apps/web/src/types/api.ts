// Mirrors the server's response DTOs (apps/server/src/services/*). Dates arrive as ISO strings.

export type Role = 'CUSTOMER' | 'AGENT' | 'ADMIN'
export type AccountStatus = 'ACTIVE' | 'DISABLED'
export type Presence = 'online' | 'away' | 'busy' | 'offline'
export type ConversationStatus = 'OPEN' | 'PENDING' | 'CLOSED'
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
export type MessageType = 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM'

export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢'] as const

export interface User {
  id: string
  name: string
  email: string
  role: Role
  avatarUrl: string | null
  status: AccountStatus
  lastSeenAt: string | null
  createdAt: string
  updatedAt: string
  presence?: Presence
}

export interface Agent extends User {
  openConversations: number
}

export interface AuthResult {
  user: User
  token: string
}

export interface Participant {
  id: string
  name: string
  email?: string
  avatarUrl: string | null
  lastSeenAt: string | null
  presence: Presence
}

export interface Conversation {
  id: string
  customerId: string
  agentId: string | null
  departmentId: string | null
  subject: string
  status: ConversationStatus
  priority: Priority
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
  customer: Participant & { email: string }
  agent: Participant | null
  department: { id: string; name: string } | null
  lastMessage: { id: string; content: string; type: MessageType; senderId: string | null; createdAt: string } | null
  unreadCount: number
}

export interface Attachment {
  id: string
  secureUrl: string
  originalName: string
  mimeType: string
  size: number
  resourceType: string
}

export interface Message {
  id: string
  conversationId: string
  content: string
  type: MessageType
  createdAt: string
  updatedAt: string
  editedAt: string | null
  deletedAt: string | null
  sender: { id: string; name: string; avatarUrl: string | null; role: Role } | null
  attachments: Attachment[]
  reactions: { emoji: string; userId: string }[]
  reads: { userId: string; readAt: string }[]
}

export interface Department {
  id: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Page<T> {
  items: T[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface MessagePage {
  items: Message[]
  hasMore: boolean
  nextCursor: string | null
}

export interface DailyCount {
  date: string
  count: number
}

export interface Stats {
  totals: {
    customers: number
    agents: number
    onlineAgents: number
    openConversations: number
    pendingConversations: number
    closedConversations: number
    messagesToday: number
  }
  conversationsPerDay: DailyCount[]
  messagesPerDay: DailyCount[]
}

export interface ActivityItem {
  id: string
  kind: 'conversation.created' | 'conversation.event' | 'user.created'
  text: string
  conversationId: string | null
  at: string
}
