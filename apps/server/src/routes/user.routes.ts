import { Router } from 'express'
import * as admin from '../controllers/admin.controller.js'
import * as users from '../controllers/user.controller.js'
import { authenticate, authorize } from '../middleware/auth.js'

export const userRouter = Router()
userRouter.use(authenticate)
userRouter.get('/', authorize('ADMIN'), users.list)
userRouter.post('/', authorize('ADMIN'), users.create)
// Admins: anyone. Others: only themselves (enforced in the service).
userRouter.get('/:id', users.get)
userRouter.patch('/:id', users.update)

export const agentRouter = Router()
agentRouter.get('/', authenticate, authorize('AGENT', 'ADMIN'), users.listAgents)

export const adminRouter = Router()
adminRouter.use(authenticate, authorize('ADMIN'))
adminRouter.get('/stats', admin.stats)
adminRouter.get('/activity', admin.activity)
