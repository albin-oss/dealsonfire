/**
 * Orders domain event conventions (Commerce Foundation C1; ADR-007 §6).
 * The taxonomy is frozen in ADR-003 §7 + the registered additive names
 * (architecture/commerce/DOMAIN_EVENTS.md). C1 emits exactly one platform
 * fact: `orders.cart.abandoned`. Order/attempt events arrive with C3+.
 */
import type { NewDomainEvent } from '../../../platform/events'

/** D-19 ordering scope: per business when known, else per aggregate. */
export const ordersOrderingScopeOf = (event: NewDomainEvent): string =>
  event.businessId ?? event.aggregate.id

export const ORDERS_EVENT = {
  CART_ABANDONED: 'orders.cart.abandoned',
  /** C3: the frozen taxonomy's first order fact — buyer intent became a promise record. */
  ORDER_PLACED: 'orders.order.placed',
} as const
