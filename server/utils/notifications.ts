/**
 * The notification seam (Commerce Foundation C7 — blueprint §5.4, ADR-007 §3:
 * Orders decides WHAT to say WHEN; delivery lives here). Deliberately not a
 * domain: no aggregates, no decisions — consumers of domain events rendering
 * the letter idiom (one fact, one next event, one door) through the MailPort.
 *
 * Replay safety is FREE: these run as outbox consumers, and the delivery
 * ledger guarantees exactly-once per (consumer, event) — an event replay
 * after redeploy sends nothing twice (notification law: no duplicates).
 *
 * Copy laws bound here (R5, THE_DOF_FEELING vocabulary): no system words, no
 * false certainty, merchant-as-subject where true; every message answers what
 * happened, what happens next, what the reader can do.
 */
import type pg from 'pg'
import type { OutboxConsumer } from '@platform/outbox-dispatcher'
import type { MailPort } from '@platform/mail'
import { asClient } from '@platform/db'

interface Deps {
  pool: pg.Pool
  mail: MailPort
  appBaseUrl: string
}

interface OrderFacts {
  order_number: string
  buyer_name: string
  buyer_email: string
  store_name: string
  owner_email: string | null
  total_minor: number
  currency: string
}

async function orderFacts(tx: unknown, orderId: string): Promise<OrderFacts | null> {
  const { rows } = await asClient(tx as never).query<OrderFacts>(
    `SELECT o.order_number,
            o.buyer_contact->>'name' AS buyer_name, o.buyer_contact->>'email' AS buyer_email,
            s.name AS store_name, o.total_minor::int AS total_minor, o.currency,
            (SELECT u.email FROM users u
             JOIN staff_memberships sm ON sm.principal_type = 'user' AND sm.principal_id = u.id
             WHERE sm.business_id = o.business_id AND 'owner' = ANY(sm.roles) AND sm.status = 'active'
             LIMIT 1) AS owner_email
     FROM orders o JOIN stores s ON s.id = o.store_id WHERE o.id = $1`, [orderId])
  return rows[0] ?? null
}

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat('en', { style: 'currency', currency }).format(minor / 100)

export function notificationConsumers(deps: Deps): { orders: OutboxConsumer[]; payments: OutboxConsumer[] } {
  const orderLink = (orderId: string) => `${deps.appBaseUrl}/o/${orderId}`
  const workshopLink = () => `${deps.appBaseUrl}/orders`

  const send = (to: string | null, subject: string, body: string) =>
    to ? deps.mail.send({ to, subject, body }) : Promise.resolve()

  const orders: OutboxConsumer[] = [
    {
      consumer: 'notify.order-confirmed',
      eventTypes: ['orders.order.confirmed'],
      async handle(tx, event) {
        const orderId = String((event.payload as { order_id?: string }).order_id ?? '')
        const facts = await orderFacts(tx, orderId)
        if (!facts) return
        await send(facts.buyer_email,
          `${facts.store_name} has your order`,
          `It's really happening — your order (${facts.order_number}) is confirmed and ${facts.store_name} is on it.\n\n` +
          `What happens next: they make it ready and ship it; we'll tell you the moment it's on its way.\n\n` +
          `Follow the whole story here: ${orderLink(orderId)}`)
        await send(facts.owner_email,
          `Someone just bought from you — ${facts.order_number}`,
          `${facts.buyer_name} bought from your shop for ${money(facts.total_minor, facts.currency)}.\n\n` +
          `What happens next: pack it and mark it shipped — the money becomes payable the moment it ships.\n\n` +
          `Everything you need is on the bench: ${workshopLink()}`)
      },
    },
    {
      consumer: 'notify.promise-missed',
      eventTypes: ['orders.order.promise_missed'],
      async handle(tx, event) {
        const orderId = String((event.payload as { order_id?: string }).order_id ?? '')
        const facts = await orderFacts(tx, orderId)
        if (!facts) return
        // the honest stumble (SM-5): told BEFORE they had to ask
        await send(facts.buyer_email,
          `About your order at ${facts.store_name}`,
          `The promised ship-by date for your order (${facts.order_number}) has passed — we wanted you to hear it from us first.\n\n` +
          `What happens next: if it doesn't ship in the next few days, your money for the unshipped items comes back automatically. That's the promise.\n\n` +
          `The story so far: ${orderLink(orderId)}`)
        await send(facts.owner_email,
          `Did this ship? ${facts.order_number} is past its promise`,
          `Your promise date for ${facts.buyer_name}'s order has passed.\n\n` +
          `What happens next: if it shipped, mark it shipped — that's all. If it can't ship, the automatic protection refunds the buyer in a few days.\n\n` +
          `The bench: ${workshopLink()}`)
      },
    },
    {
      consumer: 'notify.order-cancelled',
      eventTypes: ['orders.order.cancelled'],
      async handle(tx, event) {
        const payload = event.payload as { order_id?: string; reason?: string }
        const orderId = String(payload.order_id ?? '')
        const facts = await orderFacts(tx, orderId)
        if (!facts) return
        if (payload.reason === 'no_ship_auto_refund') {
          await send(facts.buyer_email,
            `Your money is on its way back — ${facts.store_name}`,
            `Your order (${facts.order_number}) didn't ship, so the protection kicked in: your refund is automatic and already underway.\n\n` +
            `What happens next: the money returns to your original payment method — usually within a few business days. Nothing more will be charged.\n\n` +
            `The full story: ${orderLink(orderId)}`)
          await send(facts.owner_email,
            `${facts.order_number} was refunded automatically`,
            `${facts.buyer_name}'s order passed the protection threshold without shipping, so it was refunded and closed.\n\n` +
            `What happens next: nothing is owed. If it actually shipped, reply to support — the record can be corrected.\n\n` +
            `The bench: ${workshopLink()}`)
        }
      },
    },
  ]

  const payments: OutboxConsumer[] = [
    {
      consumer: 'notify.refund-issued',
      eventTypes: ['payments.refund.issued'],
      async handle(tx, event) {
        const payload = event.payload as { order_id?: string; amount_minor?: number; currency?: string; cause_key?: string }
        const orderId = String(payload.order_id ?? '')
        const facts = await orderFacts(tx, orderId)
        if (!facts) return
        await send(facts.buyer_email,
          `${money(Number(payload.amount_minor ?? 0), String(payload.currency ?? facts.currency))} is on its way back to you`,
          `A refund for your order (${facts.order_number}) at ${facts.store_name} has been issued.\n\n` +
          `What happens next: it lands back on your original payment method, usually within a few business days.\n\n` +
          `The story: ${orderLink(orderId)}`)
      },
    },
    {
      consumer: 'notify.hold-released',
      eventTypes: ['payments.hold.released'],
      async handle(tx, event) {
        const payload = event.payload as { order_id?: string; amount_minor?: number; currency?: string }
        const orderId = String(payload.order_id ?? '')
        const facts = await orderFacts(tx, orderId)
        if (!facts) return
        await send(facts.owner_email,
          `${money(Number(payload.amount_minor ?? 0), String(payload.currency ?? facts.currency))} from ${facts.order_number} is now payable`,
          `Delivery settled for ${facts.buyer_name}'s order — the money is released for payout.\n\n` +
          `What happens next: it arrives with your normal payout. Nothing to do.\n\n` +
          `The bench: ${workshopLink()}`)
      },
    },
  ]

  return { orders, payments }
}
