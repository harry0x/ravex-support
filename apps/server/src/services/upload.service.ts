import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { deleteFile, isCloudinaryConfigured, uploadBuffer } from '../cloudinary/index.js'
import { prisma } from '../config/database.js'
import { env } from '../config/env.js'
import { AppError } from '../utils/AppError.js'
import { ALLOWED_EXTENSIONS, detectFileType, sanitizeFilename } from '../utils/files.js'
import { assertOpen, assertParticipant, getAccessibleConversation, type Actor } from './conversation.service.js'

export function assertUploadsEnabled(): void {
  if (!isCloudinaryConfigured()) {
    throw new AppError(503, 'UPLOADS_NOT_CONFIGURED', 'File uploads are not configured on this server')
  }
}

export interface IncomingFile {
  originalname: string
  size: number
  buffer: Buffer
}

/**
 * Stores a file in Cloudinary and its metadata in PostgreSQL. The upload is "pending" (no
 * message) until the uploader sends a message referencing it via `attachmentIds`.
 */
export async function createUpload(actor: Actor, conversationId: string, file: IncomingFile) {
  assertUploadsEnabled()
  const conversation = await getAccessibleConversation(actor, conversationId)
  assertParticipant(actor, conversation)
  assertOpen(conversation)

  if (file.size > env.maxFileSize) throw new AppError(413, 'FILE_TOO_LARGE', 'File is too large')
  const originalName = sanitizeFilename(file.originalname)
  const type = detectFileType(originalName, file.buffer)
  if (!type) {
    throw new AppError(400, 'INVALID_FILE_TYPE', `Unsupported or invalid file. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`)
  }

  const stored = await uploadBuffer(file.buffer, {
    folder: `ravex-support/conversations/${conversationId}`,
    resourceType: type.resourceType,
    // Raw files keep their extension so downloads open correctly; names are random, never user input.
    publicId: type.resourceType === 'raw' ? `${randomUUID()}${path.extname(originalName)}` : undefined,
  }).catch((err: unknown) => {
    console.error('Cloudinary upload failed:', err)
    throw new AppError(502, 'UPLOAD_FAILED', 'The file could not be uploaded')
  })

  try {
    return await prisma.attachment.create({
      data: {
        conversationId,
        uploaderId: actor.id,
        publicId: stored.publicId,
        url: stored.url,
        secureUrl: stored.secureUrl,
        resourceType: stored.resourceType,
        originalName,
        mimeType: type.mimeType,
        size: file.size,
      },
      select: { id: true, secureUrl: true, originalName: true, mimeType: true, size: true, resourceType: true, createdAt: true },
    })
  } catch (err) {
    await deleteFile(stored.publicId, stored.resourceType).catch(() => undefined)
    throw err
  }
}
