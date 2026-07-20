/**
 * Media Port (UX-AUTHOR-002 §D). The platform-level seam between "something stores bytes"
 * and everything that references media. TWO halves:
 *   - PERMANENT: the MediaPort contract + the media_assets registry (media_id → url).
 *   - SWAPPABLE: the storage adapter — VercelBlobStorage in production today; the C9
 *     Media capability implements the same contract later. Consumers (Product Authoring,
 *     brand kits, Sparks) depend only on this port and never change when storage does.
 * The SandboxMediaStorage is the test-law sandbox twin (in-memory, data-URL-shaped),
 * bound when no blob token is configured (tests, local dev without Vercel).
 */
import type pg from 'pg'
import { uuidv7 } from './uuid'

export const MEDIA_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type MediaContentType = (typeof MEDIA_CONTENT_TYPES)[number]
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024

export interface MediaUpload {
  businessId: string
  userId: string
  filename: string
  contentType: MediaContentType
  data: Buffer
}

export interface StoredMedia {
  mediaId: string
  url: string
}

/** The storage half — where the bytes live. Swappable (Blob today, C9 later). */
export interface MediaStorage {
  put(path: string, data: Buffer, contentType: MediaContentType): Promise<{ url: string }>
}

export class SandboxMediaStorage implements MediaStorage {
  readonly stored: Array<{ path: string; bytes: number }> = []
  async put(path: string, data: Buffer): Promise<{ url: string }> {
    this.stored.push({ path, bytes: data.length })
    return { url: `https://sandbox.media.local/${path}` }
  }
}

export class VercelBlobStorage implements MediaStorage {
  constructor(private readonly token: string) {}
  async put(path: string, data: Buffer, contentType: MediaContentType): Promise<{ url: string }> {
    const { put } = await import('@vercel/blob')
    const blob = await put(path, data, {
      access: 'public',
      contentType,
      token: this.token,
      addRandomSuffix: false, // the path already carries a uuid — deterministic, idempotent-friendly
    })
    return { url: blob.url }
  }
}

/**
 * The port itself: validate → store bytes → record the permanent registry fact.
 * The registry write is the source of truth; a stored blob without a registry row is
 * an orphan the (future) sweeper may collect — never the reverse.
 */
export class MediaService {
  constructor(private readonly pool: pg.Pool, private readonly storage: MediaStorage) {}

  async store(upload: MediaUpload): Promise<StoredMedia> {
    if (!MEDIA_CONTENT_TYPES.includes(upload.contentType)) {
      throw new MediaValidationError(`unsupported media type ${upload.contentType} — use JPEG, PNG, or WebP`)
    }
    if (upload.data.length === 0 || upload.data.length > MEDIA_MAX_BYTES) {
      throw new MediaValidationError('images can be up to 10MB')
    }
    const mediaId = uuidv7()
    const extension = upload.contentType.split('/')[1]
    const { url } = await this.storage.put(`media/${upload.businessId}/${mediaId}.${extension}`, upload.data, upload.contentType)
    await this.pool.query(
      `INSERT INTO media_assets (id, business_id, url, content_type, size_bytes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [mediaId, upload.businessId, url, upload.contentType, upload.data.length, upload.userId],
    )
    return { mediaId, url }
  }

  async resolve(mediaId: string, businessId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ url: string }>(
      `SELECT url FROM media_assets WHERE id = $1 AND business_id = $2`, [mediaId, businessId])
    return rows[0]?.url ?? null
  }
}

export class MediaValidationError extends Error {}
