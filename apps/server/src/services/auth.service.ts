import { prisma } from '../config/database.js'
import { Prisma } from '../generated/prisma/client.js'
import type { User } from '../generated/prisma/client.js'
import type { LoginInput, RegisterInput } from '../schemas/auth.schema.js'
import { AppError } from '../utils/AppError.js'
import { signAccessToken, verifyAccessToken } from '../utils/jwt.js'
import { hashPassword, verifyPassword } from '../utils/password.js'

export type PublicUser = Omit<User, 'passwordHash'>

export interface AuthResult {
  user: PublicUser
  token: string
}

/** Public registration always creates a CUSTOMER. Agents and admins are created by admins. */
export async function register(input: RegisterInput): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password)
  try {
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash, role: 'CUSTOMER' },
    })
    return { user, token: await signAccessToken(user.id) }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists')
    }
    throw err
  }
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const record = await prisma.user.findUnique({
    where: { email: input.email },
    omit: { passwordHash: false },
  })
  const valid = await verifyPassword(input.password, record?.passwordHash ?? null)
  if (!record || !valid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password')
  }
  if (record.status !== 'ACTIVE') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled')
  }
  const { passwordHash: _, ...user } = record
  return { user, token: await signAccessToken(user.id) }
}

/**
 * Resolves a bearer token to an active user, reading role/status fresh from the database so
 * disabling a user or changing their role takes effect immediately. Shared by HTTP and Ravex auth.
 */
export async function authenticateToken(token: string): Promise<PublicUser> {
  const userId = await verifyAccessToken(token)
  const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired token')
  if (user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled')
  return user
}
