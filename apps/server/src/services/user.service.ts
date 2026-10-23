import { prisma } from '../config/database.js'
import { Prisma } from '../generated/prisma/client.js'
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from '../schemas/user.schema.js'
import { AppError } from '../utils/AppError.js'
import { hashPassword } from '../utils/password.js'
import type { PublicUser } from './auth.service.js'
import { returnAgentConversationsToQueue, type Actor } from './conversation.service.js'
import { realtime } from './realtime.js'

const withPresence = (user: PublicUser) => ({ ...user, presence: realtime.presenceOf(user.id) })

export function touchLastSeen(userId: string) {
  return prisma.user.updateMany({ where: { id: userId }, data: { lastSeenAt: new Date() } })
}

export async function listUsers(query: ListUsersQuery) {
  const contains = query.q ? ({ contains: query.q, mode: 'insensitive' } as const) : undefined
  const where: Prisma.UserWhereInput = {
    role: query.role,
    status: query.status,
    ...(contains && { OR: [{ name: contains }, { email: contains }] }),
  }
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ])
  return { items: users.map(withPresence), page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) }
}

/** Admins can see anyone; everyone else only themselves. */
export async function getUser(actor: Actor, id: string) {
  if (actor.role !== 'ADMIN' && actor.id !== id) throw new AppError(404, 'USER_NOT_FOUND', 'User not found')
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found')
  return withPresence(user)
}

export async function createUser(input: CreateUserInput) {
  try {
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, role: input.role, passwordHash: await hashPassword(input.password) },
    })
    return withPresence(user)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists')
    }
    throw err
  }
}

/**
 * Users may rename themselves. Admins may also change role and status, but not their own (so the
 * last admin can't lock everyone out). Role or status changes end the user's realtime sessions.
 */
export async function updateUser(actor: Actor, id: string, input: UpdateUserInput) {
  const changesAccess = input.role !== undefined || input.status !== undefined
  if (actor.role !== 'ADMIN') {
    if (actor.id !== id) throw new AppError(404, 'USER_NOT_FOUND', 'User not found')
    if (changesAccess) throw new AppError(403, 'FORBIDDEN', 'You cannot change your own role or status')
  } else if (actor.id === id && changesAccess) {
    throw new AppError(403, 'FORBIDDEN', 'Admins cannot change their own role or status')
  }

  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) throw new AppError(404, 'USER_NOT_FOUND', 'User not found')

  const user = await prisma.user.update({ where: { id }, data: input })
  // A demoted or disabled agent's open conversations go back to the queue (with a system message).
  const leftAgentRole = existing.role === 'AGENT' && (user.role !== 'AGENT' || user.status !== 'ACTIVE')
  if (leftAgentRole) await returnAgentConversationsToQueue(id, user.name)

  if ((input.role !== undefined && input.role !== existing.role) || (input.status !== undefined && input.status !== existing.status)) {
    realtime.revokeUser(id)
  }
  return withPresence(user)
}

/** Active agents with their live presence and current workload. */
export async function listAgents() {
  const agents = await prisma.user.findMany({
    where: { role: 'AGENT', status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    include: { _count: { select: { agentConversations: { where: { status: { not: 'CLOSED' } } } } } },
  })
  return agents.map(({ _count, ...agent }) => ({ ...withPresence(agent), openConversations: _count.agentConversations }))
}
