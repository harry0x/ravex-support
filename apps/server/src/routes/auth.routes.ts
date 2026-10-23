import { Router } from 'express'
import * as auth from '../controllers/auth.controller.js'
import { authenticate } from '../middleware/auth.js'

export const authRouter = Router()

authRouter.post('/register', auth.register)
authRouter.post('/login', auth.login)
authRouter.post('/logout', authenticate, auth.logout)
authRouter.get('/me', authenticate, auth.me)
