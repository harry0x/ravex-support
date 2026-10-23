import type { PublicUser } from '../services/auth.service.js'

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware. */
      user?: PublicUser
    }
  }
}

export {}
