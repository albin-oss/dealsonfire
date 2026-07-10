/**
 * StoreFactory (ADR-001 §5.3). Stores are born Draft with Beautiful-by-Default policies —
 * nothing in Settings is ever required to start selling (ADR §11).
 * `fromIgnite` (the five-minute promise in code form) arrives with Module 3 and will
 * compose this same factory with AI-drafted inputs.
 */
import { type Result, ok, err } from '../../../../../shared/result'
import { type DomainError, domainError } from '../../../../../shared/errors'
import { type BusinessId, type StoreId, newStoreId } from '../../../shared-kernel/ids'
import { createHandle } from '../../../shared-kernel/handle'
import type { Actor } from '../../../shared-kernel/actor'
import { Store } from '../store'
import { EVENT, makeEvent, type NewDomainEvent } from '../events'

/** Beautiful by Default: honest, readable defaults a founder never has to touch to launch. */
export const DEFAULT_POLICIES = {
  returns: { version: 1, days: 14, summary: 'Returns accepted within 14 days of delivery.' },
  shipping: { version: 1, summary: 'Ships within 3–5 business days. Rates shown at checkout.' },
}

export interface NewStoreResult {
  store: Store
  events: NewDomainEvent[]
}

export function createStore(input: {
  /** Pre-generated when the caller must claim the handle before construction. */
  id?: StoreId
  businessId: BusinessId
  name: string
  handle: string
  actor: Actor
}): Result<NewStoreResult, DomainError> {
  const name = input.name.trim()
  if (!name || name.length > 80) {
    return err(domainError('VALIDATION_FAILED', 'store name must be 1–80 characters'))
  }
  const handle = createHandle(input.handle)
  if (!handle.ok) return handle

  const store = Store.fromFactory({
    id: input.id ?? newStoreId(),
    businessId: input.businessId,
    handle: handle.value,
    name,
    status: 'draft',
    enforcementHold: 'none',
    pauseContext: null,
    policies: DEFAULT_POLICIES,
    completionScore: 0,
    settings: {},
    publishedAt: null,
  })
  const events = [makeEvent(
    EVENT.STORE_CREATED,
    { type: 'store', id: store.id },
    input.businessId,
    input.actor,
    { store_id: store.id, business_id: input.businessId, handle: handle.value as string, name },
  )]
  return ok({ store, events })
}
