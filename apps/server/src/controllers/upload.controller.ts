import type { Request, Response } from 'express'
import { z } from 'zod'
import { currentUser } from '../middleware/auth.js'
import * as uploads from '../services/upload.service.js'
import { AppError } from '../utils/AppError.js'

const uploadBody = z.object({ conversationId: z.uuid('conversationId is required') })

export async function create(req: Request, res: Response): Promise<void> {
  const { conversationId } = uploadBody.parse(req.body ?? {})
  if (!req.file) throw new AppError(400, 'FILE_REQUIRED', 'Attach a file in the "file" field')
  res.status(201).json({ success: true, data: await uploads.createUpload(currentUser(req), conversationId, req.file) })
}
