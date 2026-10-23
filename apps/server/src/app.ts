import { createServer, type Server as HttpServer } from 'node:http'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { env } from './config/env.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { createRateLimiters } from './middleware/rateLimit.js'
import { createRealtime, type Realtime } from './ravex/index.js'
import { authRouter } from './routes/auth.routes.js'
import { conversationRouter } from './routes/conversation.routes.js'
import { departmentRouter } from './routes/department.routes.js'
import { createUploadRouter } from './routes/upload.routes.js'
import { adminRouter, agentRouter, userRouter } from './routes/user.routes.js'

export interface AppServer {
  httpServer: HttpServer
  realtime: Realtime
}

export interface BuildServerOptions {
  clientUrl: string
  /** HTTP rate limiting. Defaults to on, except under NODE_ENV=test. */
  rateLimit?: boolean
}

export function buildServer(options: BuildServerOptions): AppServer {
  const app = express()
  // Render (and most PaaS) terminate TLS at a proxy; trust it so req.ip is the client's address.
  if (env.isProduction) app.set('trust proxy', 1)
  app.disable('x-powered-by')

  // The frontend is served from another origin, so allow cross-origin reads of API responses.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
  app.use(cors({ origin: options.clientUrl }))
  app.use(express.json({ limit: '100kb' }))

  const limiters = (options.rateLimit ?? env.nodeEnv !== 'test') ? createRateLimiters() : null

  const httpServer = createServer(app)
  const realtime = createRealtime(httpServer, options)

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } })
  })

  if (limiters) {
    app.use('/api', limiters.api)
    app.use('/api/auth/login', limiters.login)
    app.use('/api/auth/register', limiters.register)
  }
  app.use('/api/auth', authRouter)
  app.use('/api/conversations', conversationRouter)
  app.use('/api/departments', departmentRouter)
  app.use('/api/users', userRouter)
  app.use('/api/agents', agentRouter)
  app.use('/api/admin', adminRouter)
  app.use('/api/uploads', createUploadRouter(limiters))

  app.use(notFoundHandler)
  app.use(errorHandler)

  return { httpServer, realtime }
}
