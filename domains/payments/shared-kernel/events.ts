/**
 * Payments domain event conventions (Commerce Foundation C4; ADR-008 §6).
 * M-6 discipline: constants exist for events EMITTED so far — C4 emits the
 * authorization facts; capture/hold facts arrive with C5's ceremony.
 */
import type { NewDomainEvent } from '../../../platform/events'

/** D-19 ordering scope: per business when known, else per aggregate (intent). */
export const paymentsOrderingScopeOf = (event: NewDomainEvent): string =>
  event.businessId ?? event.aggregate.id

export const PAYMENTS_EVENT = {
  AUTHORIZATION_SUCCEEDED: 'payments.authorization.succeeded',
  AUTHORIZATION_FAILED: 'payments.authorization.failed',
} as const
