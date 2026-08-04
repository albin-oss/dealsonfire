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
  /** C5: capture facts — the charge is real and the payout hold opens (AMENDMENT-001 §4). */
  CHARGE_SUCCEEDED: 'payments.charge.succeeded',
  HOLD_OPENED: 'payments.hold.opened',
  /** C6: money back (frozen name) and the hold release on fulfillment evidence. */
  REFUND_ISSUED: 'payments.refund.issued',
  HOLD_RELEASED: 'payments.hold.released',
  /** C10 Slice 3: the connected account's capabilities changed (Connect truth). */
  ACCOUNT_UPDATED: 'payments.account.updated',
  /** C10 Slice 4: chargebacks — opened freezes entitlement; closed settles it. */
  DISPUTE_OPENED: 'payments.dispute.opened',
  DISPUTE_CLOSED: 'payments.dispute.closed',
  /** C11 S2: the payout's two truths a maker hears about — it landed, or it needs another try. */
  PAYOUT_PAID: 'payments.payout.paid',
  PAYOUT_FAILED: 'payments.payout.failed',
} as const
