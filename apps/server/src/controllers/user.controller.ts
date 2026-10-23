import type { Request, Response } from 'express'
import { currentUser } from '../middleware/auth.js'
import { idParams } from '../schemas/conversation.schema.js'
import { createUserSchema, listUsersQuery, updateUserSchema } from '../schemas/user.schema.js'
import * as users from '../services/user.service.js'

export async function list(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await users.listUsers(listUsersQuery.parse(req.query)) })
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json({ success: true, data: await users.createUser(createUserSchema.parse(req.body)) })
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = idParams.parse(req.params)
  res.json({ success: true, data: await users.getUser(currentUser(req), id) })
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = idParams.parse(req.params)
  res.json({ success: true, data: await users.updateUser(currentUser(req), id, updateUserSchema.parse(req.body)) })
}

export async function listAgents(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await users.listAgents() })
}
