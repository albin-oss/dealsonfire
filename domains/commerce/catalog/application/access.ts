/**
 * Shared command-side access resolution (IMP-COM-001B): load the product under a row lock,
 * resolve the actor's merchant context, run the triple gate. Product-not-found, business-
 * not-found, and not-a-member all answer the SAME masked NOT_FOUND (kernel law).
 */
import { type Result, ok, err } from '../../../../shared/result'
import { domainError, type DomainError } from '../../../../shared/errors'
import type { Tx } from '../../../../platform/types'
import type { Actor } from '../../../merchant/shared-kernel/actor'
import { authorize, type CommandSpec } from '../../../merchant/shared-kernel/command-gate'
import { asProductId } from '../../shared-kernel/ids'
import type { Product } from '../domain/product'
import type { CommerceDeps, MerchantAccess } from './ports'

export interface AuthorizedProduct {
  product: Product
  access: MerchantAccess
}

export async function withAuthorizedProduct(
  deps: CommerceDeps,
  tx: Tx,
  input: { userId: string; actor: Actor; productId: string; spec: CommandSpec; stepUpVerified?: boolean },
): Promise<Result<AuthorizedProduct, DomainError>> {
  const product = await deps.products.findById(tx, asProductId(input.productId), { forUpdate: true })
  if (!product) return err(domainError('NOT_FOUND', 'product not found'))

  const resolved = await deps.merchantAccess.resolveAccess(tx, input.userId, product.businessId)
  if (!resolved.ok) {
    return err(domainError('NOT_FOUND', 'product not found')) // cross-tenant probes masked
  }
  const gate = authorize(
    {
      actor: input.actor,
      membership: resolved.value.membership,
      business: resolved.value.business,
      effectiveCapabilities: resolved.value.capabilities,
      stepUpVerified: input.stepUpVerified,
    },
    input.spec,
  )
  if (!gate.ok) return gate
  return ok({ product, access: resolved.value })
}

export async function withAuthorizedBusiness(
  deps: CommerceDeps,
  tx: Tx,
  input: { userId: string; actor: Actor; businessId: string; spec: CommandSpec; stepUpVerified?: boolean },
): Promise<Result<MerchantAccess, DomainError>> {
  const resolved = await deps.merchantAccess.resolveAccess(tx, input.userId, input.businessId)
  if (!resolved.ok) return resolved
  const gate = authorize(
    {
      actor: input.actor,
      membership: resolved.value.membership,
      business: resolved.value.business,
      effectiveCapabilities: resolved.value.capabilities,
      stepUpVerified: input.stepUpVerified,
    },
    input.spec,
  )
  if (!gate.ok) return gate
  return resolved
}
