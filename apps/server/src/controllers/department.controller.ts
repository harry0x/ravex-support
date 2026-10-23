import type { Request, Response } from 'express'
import { currentUser } from '../middleware/auth.js'
import { idParams } from '../schemas/conversation.schema.js'
import { departmentSchema, updateDepartmentSchema } from '../schemas/user.schema.js'
import * as departments from '../services/department.service.js'

export async function list(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await departments.listDepartments(currentUser(req)) })
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json({ success: true, data: await departments.createDepartment(departmentSchema.parse(req.body)) })
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = idParams.parse(req.params)
  res.json({ success: true, data: await departments.updateDepartment(id, updateDepartmentSchema.parse(req.body)) })
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = idParams.parse(req.params)
  await departments.deleteDepartment(id)
  res.json({ success: true, data: null })
}
