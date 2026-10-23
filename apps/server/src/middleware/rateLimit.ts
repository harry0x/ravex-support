import type { Request, Response } from 'express'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'

function limiter(options: { windowMs: number; limit: number; perUser?: boolean; onlyFailures?: boolean }) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    skipSuccessfulRequests: options.onlyFailures ?? false,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Authenticated limits are per user; anonymous ones per IP (IPv6 grouped by /56 subnet).
    keyGenerator: (req: Request) => (options.perUser && req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip ?? '')),
    handler: (_req: Request, res: Response) => {
      res.status(429).json({ success: false, message: 'Too many requests, please try again later', error: 'RATE_LIMITED' })
    },
  })
}

const MINUTE = 60_000

export function createRateLimiters() {
  return {
    /** Failed logins only, so people sharing an IP aren't locked out by each other's successful sign-ins. */
    login: limiter({ windowMs: 15 * MINUTE, limit: 10, onlyFailures: true }),
    /** Account creation spam. */
    register: limiter({ windowMs: 60 * MINUTE, limit: 20 }),
    /** Everything under /api. */
    api: limiter({ windowMs: 15 * MINUTE, limit: 1000 }),
    uploads: limiter({ windowMs: 15 * MINUTE, limit: 30, perUser: true }),
  }
}

export type RateLimiters = ReturnType<typeof createRateLimiters>
