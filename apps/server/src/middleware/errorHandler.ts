import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { ZodError } from 'zod'
import { env } from '../config/env.js'
import { AppError } from '../utils/AppError.js'

interface ErrorBody {
  success: false
  message: string
  error: string
  details?: unknown
}

function send(res: Response, status: number, body: ErrorBody): void {
  res.status(status).json(body)
}

export function notFoundHandler(req: Request, res: Response): void {
  send(res, 404, { success: false, message: `Route ${req.method} ${req.path} not found`, error: 'ROUTE_NOT_FOUND' })
}

// Express identifies error handlers by their four parameters, so `_next` must stay.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    send(res, err.statusCode, { success: false, message: err.message, error: err.code })
    return
  }

  if (err instanceof ZodError) {
    send(res, 400, {
      success: false,
      message: 'Invalid request',
      error: 'VALIDATION_ERROR',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
    return
  }

  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE'
    send(res, tooLarge ? 413 : 400, {
      success: false,
      message: tooLarge ? 'File is too large' : 'Invalid upload',
      error: tooLarge ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD',
    })
    return
  }

  // body-parser errors (malformed JSON, payload too large) carry a status and a `type`.
  if (typeof err === 'object' && err !== null && 'type' in err && 'status' in err && typeof err.status === 'number') {
    const code = err.type === 'entity.parse.failed' ? 'INVALID_JSON' : 'BAD_REQUEST'
    send(res, err.status, { success: false, message: 'Malformed request body', error: code })
    return
  }

  console.error(err)
  send(res, 500, {
    success: false,
    message: env.isProduction ? 'Something went wrong' : err instanceof Error ? err.message : String(err),
    error: 'INTERNAL_ERROR',
  })
}
