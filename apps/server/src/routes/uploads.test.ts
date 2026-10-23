import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApi, createUser, resetDatabase, startServer } from '../../test/helpers.js'
import type { AppServer } from '../app.js'
import { prisma } from '../config/database.js'
import { createConversation } from '../services/conversation.service.js'

// Cloudinary is mocked: tests never need credentials or network access to it.
const cloud = vi.hoisted(() => ({ configured: true, fail: false, uploads: [] as { folder: string; resourceType: string; publicId?: string }[] }))
vi.mock('../cloudinary/index.js', () => ({
  isCloudinaryConfigured: () => cloud.configured,
  uploadBuffer: async (_buffer: Buffer, options: { folder: string; resourceType: string; publicId?: string }) => {
    if (cloud.fail) throw new Error('network down')
    cloud.uploads.push(options)
    const publicId = `${options.folder}/${options.publicId ?? 'generated-id'}`
    return {
      publicId,
      url: `http://res.cloudinary.test/${publicId}`,
      secureUrl: `https://res.cloudinary.test/${publicId}`,
      resourceType: options.resourceType,
      bytes: 1,
    }
  },
  deleteFile: async () => {},
}))

let server: AppServer
let url: string
let api: ReturnType<typeof createApi>

beforeAll(async () => {
  const started = await startServer()
  server = started.server
  url = started.url
  api = createApi(url)
})
afterAll(async () => {
  await server.realtime.close()
})

type Session = Awaited<ReturnType<typeof createUser>>
let customer: Session
let otherCustomer: Session
let conversationId: string

beforeEach(async () => {
  await resetDatabase()
  cloud.configured = true
  cloud.fail = false
  cloud.uploads = []
  ;[customer, otherCustomer] = await Promise.all([createUser({ name: 'Cathy' }), createUser({ name: 'Oscar' })])
  conversationId = (await createConversation(customer.user, { subject: 'Broken', message: 'See screenshot' })).id
})

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d])
const PDF = Buffer.from('%PDF-1.7\n...')

async function upload(session: Session, file: { name: string; content: Buffer }, conversation = conversationId) {
  const form = new FormData()
  form.set('conversationId', conversation)
  form.set('file', new Blob([new Uint8Array(file.content)]), file.name)
  const res = await fetch(`${url}/api/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}` }, body: form })
  return { status: res.status, body: (await res.json()) as Record<string, any> }
}

describe('POST /api/uploads', () => {
  it('responds 503 when Cloudinary is not configured', async () => {
    cloud.configured = false
    const res = await upload(customer, { name: 'a.png', content: PNG })
    expect(res.status).toBe(503)
    expect(res.body.error).toBe('UPLOADS_NOT_CONFIGURED')
  })

  it('uploads an image and stores its metadata as a pending attachment', async () => {
    const res = await upload(customer, { name: 'Screen Shot.PNG', content: PNG })
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ originalName: 'Screen Shot.png', mimeType: 'image/png', resourceType: 'image', size: PNG.length })
    expect(res.body.data.secureUrl).toMatch(/^https:\/\//)
    expect(cloud.uploads).toEqual([{ folder: `ravex-support/conversations/${conversationId}`, resourceType: 'image', publicId: undefined }])

    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: res.body.data.id } })
    expect(row).toMatchObject({ messageId: null, conversationId, uploaderId: customer.user.id })
  })

  it('uploads documents as raw files with a random public id that keeps the extension', async () => {
    const res = await upload(customer, { name: 'invoice.pdf', content: PDF })
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ resourceType: 'raw', mimeType: 'application/pdf' })
    expect(cloud.uploads[0]?.publicId).toMatch(/^[0-9a-f-]{36}\.pdf$/)
  })

  it('rejects disallowed types and content that does not match the extension', async () => {
    for (const file of [
      { name: 'photo.png', content: Buffer.from('MZ this is an exe') },
      { name: 'logo.svg', content: Buffer.from('<svg onload="alert(1)"/>') },
      { name: 'run.exe', content: Buffer.from('MZ') },
      { name: 'notes.txt', content: Buffer.from([0x41, 0x00, 0x42]) },
    ]) {
      const res = await upload(customer, file)
      expect(res.status, file.name).toBe(400)
      expect(res.body.error).toBe('INVALID_FILE_TYPE')
    }
    expect(cloud.uploads).toHaveLength(0)
  })

  it('rejects files over MAX_FILE_SIZE', async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1)
    PNG.copy(big)
    const res = await upload(customer, { name: 'big.png', content: big })
    expect(res.status).toBe(413)
    expect(res.body.error).toBe('FILE_TOO_LARGE')
  })

  it('sanitizes file names', async () => {
    const res = await upload(customer, { name: '../../etc/<script>pass?wd.txt', content: Buffer.from('hello') })
    expect(res.status).toBe(201)
    expect(res.body.data.originalName).toBe('script_pass_wd.txt')
  })

  it('only lets conversation participants upload', async () => {
    const res = await upload(otherCustomer, { name: 'a.png', content: PNG })
    expect(res.status).toBe(404)
    expect((await upload(customer, { name: 'a.png', content: PNG }, 'not-a-uuid')).status).toBe(400)
  })

  it('reports Cloudinary failures without storing anything', async () => {
    cloud.fail = true
    const res = await upload(customer, { name: 'a.png', content: PNG })
    expect(res.status).toBe(502)
    expect(res.body.error).toBe('UPLOAD_FAILED')
    expect(await prisma.attachment.count()).toBe(0)
  })

  it('requires authentication and a file', async () => {
    const form = new FormData()
    form.set('conversationId', conversationId)
    expect((await fetch(`${url}/api/uploads`, { method: 'POST', body: form })).status).toBe(401)
    const res = await fetch(`${url}/api/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${customer.token}` }, body: form })
    expect(res.status).toBe(400)
  })
})

describe('sending messages with attachments', () => {
  it('links uploads to the message and sets its type', async () => {
    const image = (await upload(customer, { name: 'a.png', content: PNG })).body.data
    const res = await api(`/conversations/${conversationId}/messages`, { token: customer.token, body: { attachmentIds: [image.id] } })
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ type: 'IMAGE', content: '', attachments: [{ id: image.id, originalName: 'a.png' }] })

    const pdf = (await upload(customer, { name: 'b.pdf', content: PDF })).body.data
    const mixed = await api(`/conversations/${conversationId}/messages`, { token: customer.token, body: { content: 'docs', attachmentIds: [pdf.id] } })
    expect(mixed.body.data.type).toBe('FILE')
  })

  it('rejects reused, foreign or unknown attachments', async () => {
    const image = (await upload(customer, { name: 'a.png', content: PNG })).body.data
    await api(`/conversations/${conversationId}/messages`, { token: customer.token, body: { attachmentIds: [image.id] } })
    const reused = await api(`/conversations/${conversationId}/messages`, { token: customer.token, body: { attachmentIds: [image.id] } })
    expect(reused.status).toBe(400)
    expect(reused.body.error).toBe('INVALID_ATTACHMENT')

    // An upload from another conversation can't be smuggled in.
    const other = await createConversation(customer.user, { subject: 'Other', message: 'x' })
    const foreign = (await upload(customer, { name: 'c.png', content: PNG }, other.id)).body.data
    const res = await api(`/conversations/${conversationId}/messages`, { token: customer.token, body: { attachmentIds: [foreign.id] } })
    expect(res.body.error).toBe('INVALID_ATTACHMENT')

    const empty = await api(`/conversations/${conversationId}/messages`, { token: customer.token, body: { attachmentIds: [] } })
    expect(empty.status).toBe(400)
  })
})
