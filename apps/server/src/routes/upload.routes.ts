import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import { env } from '../config/env.js'
import * as uploads from '../controllers/upload.controller.js'
import { authenticate } from '../middleware/auth.js'
import type { RateLimiters } from '../middleware/rateLimit.js'
import { assertUploadsEnabled } from '../services/upload.service.js'

// Files are buffered in memory (never written to Render's ephemeral disk) and streamed to Cloudinary.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxFileSize, files: 1, fields: 5, fieldSize: 1024 },
})

export function createUploadRouter(limiters: RateLimiters | null) {
  const router = Router()
  router.post(
    '/',
    authenticate,
    // Check configuration before buffering the body.
    (_req: Request, _res: Response, next: NextFunction) => {
      assertUploadsEnabled()
      next()
    },
    ...(limiters ? [limiters.uploads] : []),
    upload.single('file'),
    uploads.create,
  )
  return router
}
