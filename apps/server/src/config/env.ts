import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+(s|m|h|d|w)$/, 'JWT_EXPIRES_IN must look like 15m, 12h or 7d')
    .default('7d'),
  CLIENT_URL: z.url().default('http://localhost:5173'),
  // Optional: uploads respond 503 UPLOADS_NOT_CONFIGURED until all three are set.
  CLOUDINARY_CLOUD_NAME: z.string().trim().optional(),
  CLOUDINARY_API_KEY: z.string().trim().optional(),
  CLOUDINARY_API_SECRET: z.string().trim().optional(),
  MAX_FILE_SIZE: z.coerce.number().int().positive().max(100 * 1024 * 1024).default(10 * 1024 * 1024),
})

const parsed = EnvSchema.safeParse(process.env)
if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
  throw new Error(`Invalid environment variables:\n${problems}`)
}

export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  isProduction: parsed.data.NODE_ENV === 'production',
  port: parsed.data.PORT,
  databaseUrl: parsed.data.DATABASE_URL,
  jwtSecret: parsed.data.JWT_SECRET,
  jwtExpiresIn: parsed.data.JWT_EXPIRES_IN,
  clientUrl: parsed.data.CLIENT_URL,
  cloudinary:
    parsed.data.CLOUDINARY_CLOUD_NAME && parsed.data.CLOUDINARY_API_KEY && parsed.data.CLOUDINARY_API_SECRET
      ? {
          cloudName: parsed.data.CLOUDINARY_CLOUD_NAME,
          apiKey: parsed.data.CLOUDINARY_API_KEY,
          apiSecret: parsed.data.CLOUDINARY_API_SECRET,
        }
      : null,
  maxFileSize: parsed.data.MAX_FILE_SIZE,
} as const
