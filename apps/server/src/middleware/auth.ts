import type { NextFunction, Request, Response } from 'express'
import type { Role } from '../generated/prisma/client.js'
import { authenticateToken, type PublicUser } from '../services/auth.service.js'
import { AppError } from '../utils/AppError.js'

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
  if (!token) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required')
  req.user = await authenticateToken(token)
  next()
}

/** Use after `authenticate`. The role comes from the database, never from the client. */
export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required')
    if (!roles.includes(req.user.role)) throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this')
    next()
  }
}

/** For handlers mounted behind `authenticate`. */
export function currentUser(req: Request): PublicUser {
  if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required')
  return req.user
}
