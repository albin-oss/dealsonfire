/**
 * POST /api/v1/media (UX-AUTHOR-002 §D) — upload one image through the Media Port.
 * Multipart (file + business_id), so the JSON command wrapper doesn't fit; the same
 * discipline is applied manually: auth, membership gate (tenant-safe: you may only
 * upload into a business you belong to), rate limit, RFC 9457 problems, audit.
 */
import { defineEventHandler, readMultipartFormData, getHeader, setResponseStatus } from 'h3'
import { getContainer } from '../../../utils/container'
import { resolveAuth } from '../../../utils/identity'
import { sendProblem, internalProblem } from '../../../utils/problem'
import { domainError } from '@shared/errors'
import { uuidv7, isUuid } from '@platform/uuid'
import { MEDIA_CONTENT_TYPES, MEDIA_MAX_BYTES, MediaValidationError, type MediaContentType } from '@platform/media'

export default defineEventHandler(async (event) => {
  const requestId = getHeader(event, 'x-request-id')
  const correlationId = requestId && isUuid(requestId) ? requestId : uuidv7()
  try {
    const container = getContainer()
    const auth = (event.context.auth ?? resolveAuth(event)) as { userId: string } | null
    if (!auth) return sendProblem(event, domainError('AUTH_REQUIRED', 'authentication required'), correlationId)

    if (!container.rateLimiter.allow(`media.upload:${auth.userId}`, 60, 3600)) {
      return sendProblem(event, domainError('RATE_LIMITED', 'too many uploads — wait a moment'), correlationId)
    }

    const parts = await readMultipartFormData(event)
    const file = parts?.find((p) => p.name === 'file' && p.data)
    const businessId = parts?.find((p) => p.name === 'business_id')?.data?.toString('utf8') ?? ''
    if (!file || !isUuid(businessId)) {
      return sendProblem(event, domainError('VALIDATION_FAILED', 'send a file and a business_id'), correlationId)
    }
    const contentType = (file.type ?? '') as MediaContentType
    if (!MEDIA_CONTENT_TYPES.includes(contentType)) {
      return sendProblem(event, domainError('VALIDATION_FAILED', 'use a JPEG, PNG, or WebP image'), correlationId)
    }
    if (file.data.length > MEDIA_MAX_BYTES) {
      return sendProblem(event, domainError('VALIDATION_FAILED', 'images can be up to 10MB'), correlationId)
    }

    // membership gate: uploads land only in a business the caller belongs to
    const memberships = await container.deps.uow.withTransaction((tx) =>
      container.deps.staff.listActiveByPrincipal(tx, auth.userId))
    if (!memberships.some((m) => m.businessId === businessId)) {
      return sendProblem(event, domainError('NOT_FOUND', 'business not found'), correlationId) // masked
    }

    const stored = await container.media.store({
      businessId,
      userId: auth.userId,
      filename: file.filename ?? 'upload',
      contentType,
      data: file.data,
    })
    await container.deps.uow.withTransaction((tx) =>
      container.audit.record(tx, {
        businessId, actor: { type: 'user', id: auth.userId }, command: 'platform.media.upload',
        sensitivity: 'normal', target: { type: 'media', id: stored.mediaId },
        afterDigest: { content_type: contentType, size_bytes: file.data.length },
      }))

    setResponseStatus(event, 201)
    return { media_id: stored.mediaId, url: stored.url }
  } catch (error) {
    if (error instanceof MediaValidationError) {
      return sendProblem(event, domainError('VALIDATION_FAILED', error.message), correlationId)
    }
    console.error(`[media.upload] ${correlationId}:`, error)
    return internalProblem(event, correlationId)
  }
})
