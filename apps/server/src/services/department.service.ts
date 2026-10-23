import { prisma } from '../config/database.js'
import { Prisma } from '../generated/prisma/client.js'
import type { DepartmentInput, UpdateDepartmentInput } from '../schemas/user.schema.js'
import { AppError } from '../utils/AppError.js'
import type { Actor } from './conversation.service.js'

/** Admins see every department; everyone else only active ones. */
export function listDepartments(actor: Actor) {
  return prisma.department.findMany({
    where: actor.role === 'ADMIN' ? {} : { isActive: true },
    orderBy: { name: 'asc' },
  })
}

function mapError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') throw new AppError(409, 'DEPARTMENT_EXISTS', 'A department with this name already exists')
    if (err.code === 'P2025') throw new AppError(404, 'DEPARTMENT_NOT_FOUND', 'Department not found')
  }
  throw err
}

export function createDepartment(input: DepartmentInput) {
  return prisma.department.create({ data: input }).catch(mapError)
}

export function updateDepartment(id: string, input: UpdateDepartmentInput) {
  return prisma.department.update({ where: { id }, data: input }).catch(mapError)
}

/** Conversations keep existing; their department is cleared (FK is ON DELETE SET NULL). */
export async function deleteDepartment(id: string): Promise<void> {
  await prisma.department.delete({ where: { id } }).catch(mapError)
}
