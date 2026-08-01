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

export function notificationConsumers(deps: Deps): { orders: OutboxConsumer[]; payments: OutboxConsumer[]; operations: OutboxConsumer[] } {
  const orderLink = (orderId: string) => `${deps.appBaseUrl}/o/${orderId}`
  const workshopLink = (path = '/orders') => `${deps.appBaseUrl}${path}`

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
        if (payload.reason === 'buyer_cancel' || payload.reason === 'merchant_approved') {
          await send(facts.buyer_email,
            `Cancelled — your money is on its way back`,
            `Your order (${facts.order_number}) at ${facts.store_name} is cancelled${payload.reason === 'merchant_approved' ? ' — the maker approved your request' : ' at your request'}.\n\n` +
            `What happens next: the refund lands back on your original payment method, usually within a few business days. Anything that already shipped is unaffected.\n\n` +
            `The story: ${orderLink(orderId)}`)
          await send(facts.owner_email,
            `${facts.order_number} was cancelled`,
            `${facts.buyer_name}'s order is cancelled${payload.reason === 'merchant_approved' ? ' — you approved the request' : ' before you packed it'}; the refund is handled and any tracked stock is back on your shelf.\n\n` +
            `What happens next: nothing — it's all settled.\n\n` +
            `The bench: ${workshopLink()}`)
          return
        }
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

  const cancelRequested: OutboxConsumer = {
    consumer: 'notify.cancel-requested',
    eventTypes: ['orders.order.cancel_requested'],
    async handle(tx, event) {
      const orderId = String((event.payload as { order_id?: string }).order_id ?? '')
      const facts = await orderFacts(tx, orderId)
      if (!facts) return
      await send(facts.owner_email,
        `${facts.buyer_name} asked to cancel ${facts.order_number}`,
        `The parcel is already in motion, so this one is your call.\n\n` +
        `What happens next: approve and the unshipped part refunds instantly, or keep it going and it ships as promised — decide on the bench.\n\n` +
        `${workshopLink()}`)
    },
  }
  orders.push(cancelRequested)

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
    {
      // C10 Slice 3 — the till's door: open or paused, said plainly, with the way back
      consumer: 'notify.account-updated',
      eventTypes: ['payments.account.updated'],
      async handle(tx, event) {
        const payload = event.payload as { business_id?: string; charges_enabled?: boolean; disabled_reason?: string | null }
        const { rows } = await asClient(tx as never).query<{ email: string | null }>(
          `SELECT u.email FROM users u
           JOIN staff_memberships sm ON sm.principal_type = 'user' AND sm.principal_id = u.id
           WHERE sm.business_id = $1 AND 'owner' = ANY(sm.roles) AND sm.status = 'active' LIMIT 1`,
          [String(payload.business_id ?? '')])
        const email = rows[0]?.email
        if (!email) return
        if (payload.charges_enabled) {
          await send(email,
            'Your till is open — you can take orders now',
            `Your banking setup is complete and buyers can check out from your store.\n\n` +
            `What happens next: nothing — sell. Money you earn becomes payable when orders ship.\n\n` +
            `The bench: ${workshopLink()}`)
        } else {
          await send(email,
            'Your till is paused — a banking detail needs you',
            `Checkout on your store is closed for the moment${payload.disabled_reason ? ` (the payment partner says: ${payload.disabled_reason})` : ''}.\n\n` +
            `Your storefront, story, and Sparks stay exactly where they are — only the checkout door is closed.\n\n` +
            `What you can do: open Settings → Getting paid and finish what the payment partner asks for; the door reopens on its own.\n\n` +
            `Settings: ${workshopLink('/settings')}`)
        }
      },
    },
  ]

  const operations: OutboxConsumer[] = [
    {
      consumer: 'notify.return-requested',
      eventTypes: ['operations.return.requested'],
      async handle(tx, event) {
        const orderId = String((event.payload as { order_id?: string }).order_id ?? '')
        const facts = await orderFacts(tx, orderId)
        if (!facts) return
        await send(facts.owner_email,
          `${facts.buyer_name} wants to send something back — ${facts.order_number}`,
          `A return was requested on ${facts.order_number}.\n\n` +
          `What happens next: authorize it (with your instructions), refund without the send-back, or decline with a word — one decision, on the bench.\n\n` +
          `${workshopLink()}`)
      },
    },
    {
      consumer: 'notify.return-authorized',
      eventTypes: ['operations.return.authorized'],
      async handle(tx, event) {
        const orderId = String((event.payload as { order_id?: string }).order_id ?? '')
        const facts = await orderFacts(tx, orderId)
        if (!facts) return
        await send(facts.buyer_email,
          `${facts.store_name} says: send it back`,
          `Your return on ${facts.order_number} is authorized.\n\n` +
          `What happens next: send it back (the maker's instructions are on your order page); once it arrives and checks out, your refund follows automatically.\n\n` +
          `The story: ${orderLink(orderId)}`)
      },
    },
    {
      consumer: 'notify.return-resolved',
      eventTypes: ['operations.return.resolved'],
      async handle(tx, event) {
        const payload = event.payload as { order_id?: string; refund_minor?: number }
        const orderId = String(payload.order_id ?? '')
        const facts = await orderFacts(tx, orderId)
        if (!facts) return
        await send(facts.buyer_email,
          `Your return is settled — ${facts.store_name}`,
          `The maker received and checked your return on ${facts.order_number}.\n\n` +
          `What happens next: ${Number(payload.refund_minor ?? 0) > 0 ? `${money(Number(payload.refund_minor), facts.currency)} heads back to your original payment method within a few business days.` : 'nothing further — it is settled.'}\n\n` +
          `The story: ${orderLink(orderId)}`)
      },
    },
  ]

  return { orders, payments, operations }
}
