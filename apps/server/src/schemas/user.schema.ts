import { z } from 'zod'
import { Role, UserStatus } from '../generated/prisma/enums.js'
import { registerSchema } from './auth.schema.js'

export const listUsersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(Role).optional(),
  status: z.enum(UserStatus).optional(),
  q: z.string().trim().min(1).max(100).optional(),
})

export const createUserSchema = registerSchema.extend({ role: z.enum(Role) })

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    role: z.enum(Role).optional(),
    status: z.enum(UserStatus).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update')

export const departmentSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
})

export const updateDepartmentSchema = departmentSchema
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update')

export type ListUsersQuery = z.infer<typeof listUsersQuery>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type DepartmentInput = z.infer<typeof departmentSchema>
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>
