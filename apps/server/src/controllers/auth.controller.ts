import type { Request, Response } from 'express'
import { currentUser } from '../middleware/auth.js'
import { loginSchema, registerSchema } from '../schemas/auth.schema.js'
import * as authService from '../services/auth.service.js'

export async function register(req: Request, res: Response): Promise<void> {
  const result = await authService.register(registerSchema.parse(req.body))
  res.status(201).json({ success: true, data: result })
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(loginSchema.parse(req.body))
  res.json({ success: true, data: result })
}

// Tokens are stateless bearer tokens held by the client, so logout means the client discards it.
export function logout(_req: Request, res: Response): void {
  res.json({ success: true, data: null })
}

export function me(req: Request, res: Response): void {
  res.json({ success: true, data: { user: currentUser(req) } })
}
