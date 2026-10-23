import { describe, expect, it } from 'vitest'
import { detectFileType, sanitizeFilename } from './files.js'

describe('sanitizeFilename', () => {
  it.each([
    ['report.pdf', 'report.pdf'],
    ['../../etc/passwd.txt', 'passwd.txt'],
    ['C:\\Users\\me\\photo.JPG', 'photo.jpg'],
    ['<img src=x onerror=alert(1)>.png', 'img src_x onerror_alert_1.png'],
    ['...', 'file'],
    ['.png', 'file.png'],
    ['naïve résumé.docx', 'naïve résumé.docx'],
    ['a'.repeat(300) + '.txt', 'a'.repeat(116) + '.txt'],
  ])('%s -> %s', (input, expected) => {
    expect(sanitizeFilename(input)).toBe(expected)
  })
})

describe('detectFileType', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04])

  it('accepts content that matches the extension', () => {
    expect(detectFileType('a.png', png)?.mimeType).toBe('image/png')
    expect(detectFileType('a.JPEG', jpeg)?.mimeType).toBe('image/jpeg')
    expect(detectFileType('a.webp', webp)?.resourceType).toBe('image')
    expect(detectFileType('a.docx', zip)?.resourceType).toBe('raw')
    expect(detectFileType('a.csv', Buffer.from('a,b\n1,2'))?.mimeType).toBe('text/csv')
  })

  it('rejects mismatched content, unknown extensions and empty files', () => {
    expect(detectFileType('a.png', jpeg)).toBeNull()
    expect(detectFileType('a.pdf', png)).toBeNull()
    expect(detectFileType('a.svg', Buffer.from('<svg/>'))).toBeNull()
    expect(detectFileType('a.html', Buffer.from('<html>'))).toBeNull()
    expect(detectFileType('noext', png)).toBeNull()
    expect(detectFileType('a.txt', Buffer.alloc(0))).toBeNull()
  })
})
