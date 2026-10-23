import path from 'node:path'

interface FileType {
  mimeType: string
  resourceType: 'image' | 'raw'
  /** Checks the file's leading bytes ("magic numbers") match the claimed type. */
  matches(buffer: Buffer): boolean
}

const startsWith = (buffer: Buffer, ...bytes: number[]) => bytes.every((b, i) => buffer[i] === b)
const ascii = (buffer: Buffer, offset: number, text: string) => buffer.subarray(offset, offset + text.length).toString('latin1') === text
const isZip = (buffer: Buffer) => startsWith(buffer, 0x50, 0x4b, 0x03, 0x04)
/** Plain text must not contain NUL bytes (a cheap binary check). */
const isText = (buffer: Buffer) => !buffer.subarray(0, 8192).includes(0)

const JPEG: FileType = { mimeType: 'image/jpeg', resourceType: 'image', matches: (b) => startsWith(b, 0xff, 0xd8, 0xff) }

/**
 * Allowed upload types, keyed by extension. The browser-supplied MIME type is ignored: the type
 * comes from the extension and is verified against the content. SVG is deliberately excluded
 * (it can carry scripts).
 */
const FILE_TYPES: Record<string, FileType> = {
  '.jpg': JPEG,
  '.jpeg': JPEG,
  '.png': { mimeType: 'image/png', resourceType: 'image', matches: (b) => startsWith(b, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) },
  '.gif': { mimeType: 'image/gif', resourceType: 'image', matches: (b) => ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a') },
  '.webp': { mimeType: 'image/webp', resourceType: 'image', matches: (b) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP') },
  '.pdf': { mimeType: 'application/pdf', resourceType: 'raw', matches: (b) => ascii(b, 0, '%PDF-') },
  '.txt': { mimeType: 'text/plain', resourceType: 'raw', matches: isText },
  '.csv': { mimeType: 'text/csv', resourceType: 'raw', matches: isText },
  '.docx': { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', resourceType: 'raw', matches: isZip },
  '.xlsx': { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', resourceType: 'raw', matches: isZip },
  '.zip': { mimeType: 'application/zip', resourceType: 'raw', matches: isZip },
}

export const ALLOWED_EXTENSIONS = Object.keys(FILE_TYPES)

const MAX_NAME_LENGTH = 120

/** Strips paths, control and unusual characters; keeps the extension; never returns an empty name. */
export function sanitizeFilename(original: string): string {
  const base = path.basename(original.replaceAll('\\', '/')).normalize('NFKC')
  // Not path.extname: it treats ".png" as a dotfile with no extension and "..." as extension ".".
  const ext = /\.[a-z0-9]{1,10}$/i.exec(base)?.[0].toLowerCase() ?? ''
  const stem = base
    .slice(0, base.length - ext.length)
    .replace(/[^\p{L}\p{N} ._-]/gu, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[\s._]+|[\s._]+$/g, '')
  const safeStem = (stem || 'file').slice(0, MAX_NAME_LENGTH - ext.length)
  return `${safeStem}${ext}`
}

/** Returns the verified type, or null if the extension isn't allowed or the content doesn't match. */
export function detectFileType(filename: string, buffer: Buffer): FileType | null {
  const type = FILE_TYPES[path.extname(filename).toLowerCase()]
  if (!type || buffer.length === 0 || !type.matches(buffer)) return null
  return type
}
