import { v2 as cloudinary } from 'cloudinary'
import { env } from '../config/env.js'

export type CloudinaryResourceType = 'image' | 'raw'

export interface StoredFile {
  publicId: string
  url: string
  secureUrl: string
  resourceType: CloudinaryResourceType
  bytes: number
}

let configured = false

/** All Cloudinary access goes through this module. Credentials never leave the server. */
export function isCloudinaryConfigured(): boolean {
  if (!env.cloudinary) return false
  if (!configured) {
    cloudinary.config({
      cloud_name: env.cloudinary.cloudName,
      api_key: env.cloudinary.apiKey,
      api_secret: env.cloudinary.apiSecret,
      secure: true,
    })
    configured = true
  }
  return true
}

export function uploadBuffer(
  buffer: Buffer,
  options: { folder: string; resourceType: CloudinaryResourceType; publicId?: string },
): Promise<StoredFile> {
  if (!isCloudinaryConfigured()) return Promise.reject(new Error('Cloudinary is not configured'))

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: options.folder, resource_type: options.resourceType, public_id: options.publicId, overwrite: false },
      (err, result) => {
        if (err || !result) {
          reject(new Error(err?.message ?? 'Cloudinary upload failed'))
          return
        }
        resolve({
          publicId: result.public_id,
          url: result.url,
          secureUrl: result.secure_url,
          resourceType: options.resourceType,
          bytes: result.bytes,
        })
      },
    )
    stream.end(buffer)
  })
}

export async function deleteFile(publicId: string, resourceType: CloudinaryResourceType): Promise<void> {
  if (!isCloudinaryConfigured()) return
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType })
}
