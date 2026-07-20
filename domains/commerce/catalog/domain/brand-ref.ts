/**
 * BrandRef (PROMPT-016). A business's convenience pick-list of brand names its products carry.
 * ADR-002 is FROZEN: brand is a product *attribute*, not a platform entity — BrandRef is only a
 * reusable label list a product's `brand` attribute may point at. No marketplace Brand persona.
 */
import { type Result, ok, err } from '../../../../shared/result'
import { domainError, type DomainError } from '../../../../shared/errors'
import type { BrandRefId } from '../../shared-kernel/ids'
import type { BusinessId } from '../../../merchant/shared-kernel/ids'

export interface BrandRefProps {
  id: BrandRefId
  businessId: BusinessId
  name: string
}

export function createBrandRef(input: { id: BrandRefId; businessId: BusinessId; name: string }): Result<BrandRefProps, DomainError> {
  const name = input.name.trim()
  if (name.length < 1 || name.length > 80) return err(domainError('VALIDATION_FAILED', 'brand name fits in 1–80 characters'))
  return ok(Object.freeze({ id: input.id, businessId: input.businessId, name }))
}
