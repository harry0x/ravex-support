import { z } from 'zod'
import { ConversationStatus, Priority } from '../generated/prisma/enums.js'

export const MAX_MESSAGE_LENGTH = 5000
export const MAX_ATTACHMENTS = 5
export const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '😮', '😢'] as const

export const idParams = z.object({ id: z.uuid('Invalid id') })

export const messageContent = z.string().trim().min(1, 'Message cannot be empty').max(MAX_MESSAGE_LENGTH)

export const createConversationSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(200),
  departmentId: z.uuid().optional(),
  message: messageContent,
})

export const updateConversationSchema = z
  .object({
    status: z.enum(ConversationStatus).optional(),
    priority: z.enum(Priority).optional(),
    departmentId: z.uuid().nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update')

export const assignConversationSchema = z.object({
  /** Agents omit this to accept the conversation themselves. Admins pass an agent id, or null to unassign. */
  agentId: z.uuid().nullable().optional(),
})

export const listConversationsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(ConversationStatus).optional(),
  assigned: z.enum(['me', 'unassigned']).optional(),
  /** Staff only: matches customer name/email, subject or message content. */
  q: z.string().trim().min(1).max(100).optional(),
})

export const createMessageSchema = z
  .object({
    content: z.string().trim().max(MAX_MESSAGE_LENGTH).optional(),
    attachmentIds: z.array(z.uuid()).max(MAX_ATTACHMENTS).optional(),
  })
  .refine((v) => Boolean(v.content) || (v.attachmentIds?.length ?? 0) > 0, 'Message cannot be empty')

export const listMessagesQuery = z.object({
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export type CreateConversationInput = z.infer<typeof createConversationSchema>
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>
export type AssignConversationInput = z.infer<typeof assignConversationSchema>
export type ListConversationsQuery = z.infer<typeof listConversationsQuery>
export type ListMessagesQuery = z.infer<typeof listMessagesQuery>
export type CreateMessageBody = z.infer<typeof createMessageSchema>
