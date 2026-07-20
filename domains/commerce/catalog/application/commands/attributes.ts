/**
 * Attribute-set + brand-ref commands (PROMPT-016). Triple-gated (reusing the catalog authoring
 * permission/capability — these are catalog authoring ops), audited, one transaction each.
 * No new domain events: attribute sets are business-local config with no cross-domain consumer.
 */
import { type Result, ok, err } from '../../../../../shared/result'
import { domainError, type DomainError } from '../../../../../shared/errors'
import type { Actor } from '../../../../merchant/shared-kernel/actor'
import { asBusinessId } from '../../../../merchant/shared-kernel/ids'
import { AttributeSet, createDefinitions } from '../../domain/attribute-set'
import { createBrandRef } from '../../domain/brand-ref'
import { newAttributeSetId, asAttributeSetId, newBrandRefId } from '../../../shared-kernel/ids'
import { withAuthorizedBusiness } from '../access'
import type { CommerceDeps } from '../ports'

const SPEC = { permission: 'catalog.product.write', capability: 'catalog.products' } as const

export interface CreateAttributeSetCommand {
  actor: Actor; userId: string; businessId: string
  name: string; definitions: unknown; requestContext?: Record<string, unknown>
}

export function createAttributeSetCommand(deps: CommerceDeps) {
  return async (input: CreateAttributeSetCommand): Promise<Result<{ id: string }, DomainError>> => {
    const defs = createDefinitions(input.definitions)
    if (!defs.ok) return defs
    return deps.uow.withTransaction(async (tx) => {
      const access = await withAuthorizedBusiness(deps, tx, { userId: input.userId, actor: input.actor, businessId: input.businessId, spec: { command: 'commerce.attribute_set.create', ...SPEC } })
      if (!access.ok) return access
      const made = AttributeSet.create({ id: newAttributeSetId(), businessId: asBusinessId(input.businessId), name: input.name, definitions: defs.value })
      if (!made.ok) return made
      await deps.attributeSets.insert(tx, made.value)
      await deps.audit.record(tx, {
        businessId: input.businessId, actor: input.actor, command: 'commerce.attribute_set.create',
        sensitivity: 'normal', target: { type: 'attribute_set', id: made.value.id },
        afterDigest: { name: made.value.name, definitions: made.value.definitions.length }, context: input.requestContext,
      })
      return ok({ id: made.value.id })
    })
  }
}

export interface ArchiveAttributeSetCommand { actor: Actor; userId: string; businessId: string; attributeSetId: string; requestContext?: Record<string, unknown> }

export function archiveAttributeSetCommand(deps: CommerceDeps) {
  return async (input: ArchiveAttributeSetCommand): Promise<Result<{ archived: boolean }, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const access = await withAuthorizedBusiness(deps, tx, { userId: input.userId, actor: input.actor, businessId: input.businessId, spec: { command: 'commerce.attribute_set.archive', ...SPEC } })
      if (!access.ok) return access
      const set = await deps.attributeSets.findById(tx, asAttributeSetId(input.attributeSetId), { forUpdate: true })
      if (!set || set.businessId !== input.businessId) return err(domainError('NOT_FOUND', 'attribute set not found'))
      if (!set.archive()) return ok({ archived: false })
      await deps.attributeSets.update(tx, set)
      await deps.audit.record(tx, {
        businessId: input.businessId, actor: input.actor, command: 'commerce.attribute_set.archive',
        sensitivity: 'normal', target: { type: 'attribute_set', id: set.id }, afterDigest: { status: 'archived' }, context: input.requestContext,
      })
      return ok({ archived: true })
    })
  }
}

export interface CreateBrandRefCommand { actor: Actor; userId: string; businessId: string; name: string; requestContext?: Record<string, unknown> }

export function createBrandRefCommand(deps: CommerceDeps) {
  return async (input: CreateBrandRefCommand): Promise<Result<{ id: string }, DomainError>> => {
    const brand = createBrandRef({ id: newBrandRefId(), businessId: asBusinessId(input.businessId), name: input.name })
    if (!brand.ok) return brand
    return deps.uow.withTransaction(async (tx) => {
      const access = await withAuthorizedBusiness(deps, tx, { userId: input.userId, actor: input.actor, businessId: input.businessId, spec: { command: 'commerce.brand_ref.create', ...SPEC } })
      if (!access.ok) return access
      const id = await deps.brandRefs.insert(tx, brand.value)
      await deps.audit.record(tx, {
        businessId: input.businessId, actor: input.actor, command: 'commerce.brand_ref.create',
        sensitivity: 'normal', target: { type: 'brand_ref', id }, afterDigest: { name: brand.value.name }, context: input.requestContext,
      })
      return ok({ id })
    })
  }
}
