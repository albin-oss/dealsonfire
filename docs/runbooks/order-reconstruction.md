# Runbook — Reconstructing any order in under two minutes

**Audience:** support / operator with read access. **Promise (OPERATIONS_REALITY_REVIEW):** three queries tell the whole story of any order — what was promised, what happened, and where the money is. Everything is append-only; nothing you read can have been edited.

## 1. The story (order + lines + timeline)

```sql
SELECT o.order_number, o.state, o.placed_at, o.total_minor, o.currency,
       o.buyer_contact, o.delivery, s.name AS store_name
FROM orders o JOIN stores s ON s.id = o.store_id
WHERE o.id = $ORDER_ID;

SELECT line_no, title, option_label, quantity, unit_price_minor, line_state, reservation_id
FROM order_lines WHERE order_id = $ORDER_ID ORDER BY line_no;

SELECT entry_type, message, actor, occurred_at
FROM order_timeline WHERE order_id = $ORDER_ID ORDER BY occurred_at;
```

The timeline is the buyer's view and the audit view — they are the same facts (O3).

## 2. The money (intent + facts + ledger)

```sql
SELECT id, state, amount_minor, captured_minor, refunded_minor, provider, provider_ref
FROM payment_intents WHERE order_id = $ORDER_ID;

SELECT kind, amount_minor, provider_event_id, detail, occurred_at
FROM payment_facts WHERE intent_id = $INTENT_ID ORDER BY occurred_at;

SELECT a.kind, a.business_id, e.delta_minor, e.cause, e.created_at
FROM ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id
WHERE e.cause->>'order_id' = $ORDER_ID::text ORDER BY e.created_at;
```

`captured ≤ amount` and `refunded ≤ captured` are schema-enforced; if the ledger and Stripe ever disagree, the reconciliation identity (`Stripe balance ≡ holding + payable`) is the treaty — discrepancies are records, never silently fixed.

## 3. The stock (reservations + ledger)

```sql
SELECT r.id, r.status, r.quantity, r.expires_at
FROM reservations r WHERE r.order_line_id IN (SELECT ol.variant_id FROM order_lines ol WHERE ol.order_id = $ORDER_ID);
-- (join by the reservation_id on order_lines when present)

SELECT delta, reason, cause_ref, created_at FROM stock_ledger
WHERE cause_ref->>'order_line_id' IS NOT NULL AND cause_ref->>'reservation_id' IN
  (SELECT reservation_id::text FROM order_lines WHERE order_id = $ORDER_ID)
ORDER BY created_at;
```

## 4. The domain events (cross-domain trace)

```sql
SELECT event_type, payload, occurred_at, correlation_id FROM orders_domain_events
WHERE aggregate_id = $ORDER_ID ORDER BY occurred_at;
```

Follow `correlation_id` into `payments_domain_events` / `operations_domain_events` for the full cross-domain trace of one request.

## Known manual interventions (with the alarm that names them)

| Alarm (logger, component `orders-confirm`) | Meaning | Manual step |
|---|---|---|
| `payment_pending exceeded 24h … COMMITTED stock` | money never captured, stock already sold | reason-coded stock adjustment (`adjusted`, cause: the order id); optionally re-shelve |
| *(C6)* no-ship auto-refund fired | keystone enforced automatically | none — verify refund fact landed; note to merchant |

Pre-C8 courtesy paths (address change, voluntary cancellation): coordinate merchant↔buyer by email (both visible on the merchant's order card); money movements pre-C8 are operator-executed refunds via the provider dashboard, recorded as a timeline `note`.
