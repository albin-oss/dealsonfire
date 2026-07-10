/**
 * ProductMedia — child ENTITY of the Product aggregate (ADR-002 §10, BLUEPRINT-002 §2.3).
 * An entity (not jsonb) because per-variant assignment, reordering, and future AI image
 * swaps target individual rows with durable identity. It holds a MediaRef ONLY — bytes,
 * transforms, and CDN belong to the Media domain (frozen law). Gallery COMPOSITION
 * (order, roles, alt text) is merchandising and therefore ours.
 */
import { type Result, ok, err } from '../../../../shared/result'
import { type DomainError, domainError } from '../../../../shared/errors'
import { createMediaRef, type MediaRef } from '../../../merchant/shared-kernel/media-ref'
import { type ProductMediaId, type VariantId, newProductMediaId } from '../../shared-kernel/ids'

export const MEDIA_ROLES = ['gallery', 'hero', 'swatch'] as const
export type MediaRole = (typeof MEDIA_ROLES)[number]

export const MAX_ALT_TEXT_LENGTH = 300

export interface ProductMediaProps {
  id: ProductMediaId
  media: MediaRef
  variantId: VariantId | null
  role: MediaRole
  altText: string | null
  position: number
}

export interface ProductMediaInput {
  id?: ProductMediaId
  mediaId: string
  /** MediaRef RENDER hint (e.g. 'thumb', 'hero-crop') — unrelated to variantId, which links a product Variant. */
  renderVariant?: string
  variantId?: VariantId | null
  role?: MediaRole
  altText?: string | null
  position?: number
}

export class ProductMedia {
  private constructor(private readonly props: ProductMediaProps) {}

  static create(input: ProductMediaInput): Result<ProductMedia, DomainError> {
    const media = createMediaRef(input.mediaId, input.renderVariant)
    if (!media.ok) return media
    const role = input.role ?? 'gallery'
    if (!MEDIA_ROLES.includes(role)) {
      return err(domainError('VALIDATION_FAILED', `media role must be one of: ${MEDIA_ROLES.join(', ')}`))
    }
    const altText = input.altText?.trim() || null
    if (altText && altText.length > MAX_ALT_TEXT_LENGTH) {
      return err(domainError('VALIDATION_FAILED', `alt text must be at most ${MAX_ALT_TEXT_LENGTH} characters`))
    }
    return ok(new ProductMedia({
      id: input.id ?? newProductMediaId(),
      media: media.value,
      variantId: input.variantId ?? null,
      role,
      altText,
      position: input.position ?? 0,
    }))
  }

  static rehydrate(props: ProductMediaProps): ProductMedia {
    return new ProductMedia(props)
  }

  get id() { return this.props.id }
  get media() { return this.props.media }
  get variantId() { return this.props.variantId }
  get role() { return this.props.role }
  get altText() { return this.props.altText }
  get position() { return this.props.position }

  /** Duplicate detector: the same asset may appear once per (product-level | variant) scope. */
  get attachmentKey(): string {
    return `${this.props.media.mediaId}:${this.props.variantId ?? 'product'}`
  }

  setPosition(position: number): void {
    this.props.position = position
  }
}
