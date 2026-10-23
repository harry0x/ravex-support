import { Router } from 'express'
import * as conversations from '../controllers/conversation.controller.js'
import { authenticate, authorize } from '../middleware/auth.js'

export const conversationRouter = Router()

conversationRouter.use(authenticate)

conversationRouter.get('/', conversations.list)
conversationRouter.post('/', authorize('CUSTOMER'), conversations.create)
conversationRouter.get('/:id', conversations.get)
conversationRouter.patch('/:id', conversations.update)
conversationRouter.post('/:id/assign', authorize('AGENT', 'ADMIN'), conversations.assign)
conversationRouter.get('/:id/messages', conversations.listMessages)
conversationRouter.post('/:id/messages', conversations.createMessage)
