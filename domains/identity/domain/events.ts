/**
 * Identity events (WP-R1-B1; ADR-003 §7 frozen names). Batch registers EXACTLY the two
 * emitted events (M-6 emitted-only law): user.registered, session.revoked_all.
 * kyc and deactivated events are out of scope and unregistered. Ordering scope: user id.
 */
import type { Actor } from '../../merchant/shared-kernel/actor'
import type { NewDomainEvent } from '../../../platform/events'

export type { NewDomainEvent } from '../../../platform/events'

export const IDENTITY_EVENT = {
  USER_REGISTERED: 'identity.user.registered',
  SESSION_REVOKED_ALL: 'identity.session.revoked_all',
} as const

export type UserRegisteredPayload = {
  user_id: string
  source: 'direct' | 'ignite_claim'
}

export type SessionRevokedAllPayload = {
  user_id: string
  kept_current: boolean
}

export function makeIdentityEvent<P>(
  eventType: string,
  userId: string,
  actor: Actor,
  payload: P,
): NewDomainEvent<P> {
  return Object.freeze({
    eventType,
    schemaVersion: 1,
    businessId: null,
    aggregate: { type: 'user', id: userId },
    actor,
    payload: Object.freeze(payload),
  })
}

/** Ordering scope (D-19): identity facts serialize per user. */
export function identityOrderingScopeOf(event: NewDomainEvent): string {
  return event.aggregate.id
}
