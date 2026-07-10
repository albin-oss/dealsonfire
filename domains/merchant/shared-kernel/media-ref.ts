/**
 * MediaRef VO — media_id + variant hints, never a URL (ADR-001 §5.2).
 * Keeps the Merchant domain structurally decoupled from Media-domain internals.
 */
import { type Result, ok, err } from '../../../shared/result'
import { type DomainError, domainError } from '../../../shared/errors'
import { isUuid } from './uuid'
import type { MediaId } from './ids'

export interface MediaRef {
  readonly mediaId: MediaId
  readonly variant?: string // rendering hint, e.g. 'thumb' | 'hero'
}

export function createMediaRef(mediaId: string, variant?: string): Result<MediaRef, DomainError> {
  if (!isUuid(mediaId)) return err(domainError('VALIDATION_FAILED', 'mediaId must be a UUID'))
  if (variant !== undefined && !/^[a-z0-9_-]{1,32}$/.test(variant)) {
    return err(domainError('VALIDATION_FAILED', 'media variant hint is invalid'))
  }
  return ok(Object.freeze({ mediaId: mediaId as MediaId, ...(variant ? { variant } : {}) }))
}
