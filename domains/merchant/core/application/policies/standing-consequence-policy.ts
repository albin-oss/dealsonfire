/**
 * StandingConsequencePolicy (ADR-001 §5.4, DECISIONS D-11) — event-reactive policy and the
 * kernel's first real outbox consumer: suspension/ban of a Business places an enforcement
 * hold on every one of its stores; remediation to good standing lifts only the holds this
 * policy imposed. Runs with a `system` actor; every change is evented and therefore audited.
 */
import type { KernelDeps } from '../deps'
import type { StoredDomainEvent, BusinessStandingChangedPayload } from '../../domain/events'
import { EVENT } from '../../domain/events'
import { traceFromEvent } from '../trace'
import { systemActor } from '../../../shared-kernel/actor'
import { asBusinessId } from '../../../shared-kernel/ids'
import type { Tx } from '../../domain/ports'

export const STANDING_POLICY_CONSUMER = 'merchant.standing-consequence-policy'
const REASON = 'standing_consequence'

export function standingConsequencePolicy(deps: KernelDeps) {
  return {
    consumer: STANDING_POLICY_CONSUMER,
    eventTypes: [EVENT.BUSINESS_STANDING_CHANGED],

    async handle(tx: Tx, event: StoredDomainEvent): Promise<void> {
      const payload = event.payload as unknown as BusinessStandingChangedPayload
      const actor = systemActor(STANDING_POLICY_CONSUMER)
      const trace = traceFromEvent(event) // chain: inherit correlation, causation = source event
      const stores = await deps.stores.listByBusiness(tx, asBusinessId(payload.business_id))

      if (payload.to === 'suspended' || payload.to === 'banned') {
        for (const store of stores) {
          if (store.enforcementHold === 'suspended') continue
          const result = store.setEnforcementHold('suspended', REASON, actor)
          if (!result.ok) throw new Error(result.error.message) // system actor: must never happen
          await deps.stores.update(tx, store)
          await deps.eventStore.append(tx, store.pullPendingEvents(), trace)
        }
      } else if (payload.to === 'good') {
        for (const store of stores) {
          if (store.enforcementHold !== 'suspended') continue
          const result = store.setEnforcementHold('none', REASON, actor)
          if (!result.ok) throw new Error(result.error.message)
          await deps.stores.update(tx, store)
          await deps.eventStore.append(tx, store.pullPendingEvents(), trace)
        }
      }
      // flagged/restricted: business-level consequences only; store holds unchanged (ADR §7.2).
    },
  }
}
