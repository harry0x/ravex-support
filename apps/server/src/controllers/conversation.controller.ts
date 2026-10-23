import type { Request, Response } from 'express'
import { currentUser } from '../middleware/auth.js'
import {
  assignConversationSchema,
  createConversationSchema,
  createMessageSchema,
  idParams,
  listConversationsQuery,
  listMessagesQuery,
  updateConversationSchema,
} from '../schemas/conversation.schema.js'
import * as conversations from '../services/conversation.service.js'
import * as messages from '../services/message.service.js'

export async function list(req: Request, res: Response): Promise<void> {
  const data = await conversations.listConversations(currentUser(req), listConversationsQuery.parse(req.query))
  res.json({ success: true, data })
}

export async function create(req: Request, res: Response): Promise<void> {
  const data = await conversations.createConversation(currentUser(req), createConversationSchema.parse(req.body))
  res.status(201).json({ success: true, data })
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = idParams.parse(req.params)
  res.json({ success: true, data: await conversations.getConversation(currentUser(req), id) })
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = idParams.parse(req.params)
  const data = await conversations.updateConversation(currentUser(req), id, updateConversationSchema.parse(req.body))
  res.json({ success: true, data })
}

export async function assign(req: Request, res: Response): Promise<void> {
  const { id } = idParams.parse(req.params)
  const data = await conversations.assignConversation(currentUser(req), id, assignConversationSchema.parse(req.body ?? {}))
  res.json({ success: true, data })
}

export async function listMessages(req: Request, res: Response): Promise<void> {
  const { id } = idParams.parse(req.params)
  const data = await messages.listMessages(currentUser(req), id, listMessagesQuery.parse(req.query))
  res.json({ success: true, data })
}

export async function createMessage(req: Request, res: Response): Promise<void> {
  const { id } = idParams.parse(req.params)
  const body = createMessageSchema.parse(req.body)
  res.status(201).json({ success: true, data: await messages.createMessage(currentUser(req), id, body) })
}
