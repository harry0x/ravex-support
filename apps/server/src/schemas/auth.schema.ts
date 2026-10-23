import { z } from 'zod'

const email = z.email().trim().toLowerCase().max(254)

// bcrypt only uses the first 72 bytes of a password, so reject anything longer.
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Password must be at most 72 bytes')

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email,
  password,
})

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(1024),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
