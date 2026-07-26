# DOF Commerce Foundation — SHIPPING_ARCHITECTURE

**Status:** Blueprint for Founder Review · v1.0 · 2026-07-25 · Shipping is **Operations-owned** (ADR-006 `shipping/` module: ShippingProfile/Zone/Rate, Shipment, Label, TrackingEvent, PromiseDate math, CarrierPort — frozen). This document specifies the checkout-facing contract and the v1 surface depth.

---

## 1. The aggregates (frozen homes, restated)

- **ShippingProfile** (root, Operations): a merchant's shipping offer — zones, rates, handling time. One default profile per store at Ignite (the Reveal already writes it — OPS-002 wiring); products may override profile membership later (profile-per-product-set, structure present, surfaced on evidence).
- **Zone** (entity): named destination set (country/region lists). `ZoneResolution` is deterministic (SP2): most-specific match wins; no overlapping ambiguity survives validation.
- **Rate** (entity): per zone — v1 kinds: `flat` · `free_over(threshold)` · `pickup` (zero-rate, location-bound). Calculated/carrier-live rates are an adapter tier behind the same shape (Enterprise surface depth, ADR-006 §146).
- **Shipment** (root): the physical dispatch — package(s), carrier ref, label ref, TrackingEvents, promise date. Split shipments are multiple Shipments under one FulfillmentCase group (A7-4: cases group lines by (location, method)).

## 2. Buyer-facing journey

Cart: earliest honest estimate ("Ships from Lisbon · free over €50") from the store's profile — advisory, cheap, cacheable. Checkout: `ShippingQuoteQuery` per (location, method) group returns priced options + PromiseSnapshot ("Arrives Thu, Feb 12 — we defend this date"); the chosen option freezes into the order's LineSnapshots. After placement: TrackingEvents append to the order timeline via `shipping.shipment.*` events; "2 of 3 shipped" honesty is line-state truth (ORDER_STATE_MACHINE §4).

## 3. The checkout contract (new, consumer-driven — the CDC pattern)

```
ShippingQuoteQuery.get({
  storeId, groups: [{ lines: [{variantId, qty}], method, destination }]
}) → {
  groups: [{ options: [{ rateId, label, amountMinor, currency,
                          promise: { earliest, latest } }] }]
} | UNSHIPPABLE { group, reason }   // honest: no zone covers destination
```

Fail-closed at checkout; `UNSHIPPABLE` renders as honest guidance ("Rosa Knits doesn't ship to Iceland yet — ask them"), never a dead end. Idempotent pure read; versioned like every port.

## 4. Tracking

v1: merchant marks dispatched + optional carrier/tracking number (manual TrackingEvent; the honest majority case for maker-scale merchants); the buyer link renders carrier deep-links. CarrierPort adapters (live rates, label purchase, webhook tracking) are a registry tier that activates per-merchant on evidence — no redesign, more truth per event. `promise_at_risk` (ADR-006 integration set) fires the Recovery Journey regardless of tracking tier — the promise date is DOF's, not the carrier's.

## 5. Split & multi-origin

Already structural: FulfillmentPlanner groups order lines by (location, method) → one case per group → N shipments per case as the merchant actually packs. Multi-origin is "more locations" (Operations' Ghost Location grows up) — zero Orders changes. Partial shipment honesty is the line-state machine.

## 6. Failure modes

| Failure | Behavior |
|---|---|
| No rate covers destination | `UNSHIPPABLE` before payment, honest copy |
| Rate config changes mid-checkout | frozen quote honored for the attempt TTL (the merchant's change applies to the next attempt) |
| Carrier webhook lies/duplicates | TrackingEvents idempotent by (shipment, carrier event id); state derives from fact set |
| Promise at risk | `operations.shipment.promise_at_risk` → proactive-disclosure Recovery Journey (R2: merchant signs the note) |
| Lost shipment | exception fact → case exception → merchant decision card (refund/reship via the standard flows) |

## 7. Performance & scale

Quote path: profile+zone resolution is a read over merchant-scale config (cacheable per store, invalidated on profile write); p99 < 150ms. Tracking ingestion parallelizes across shipments. Zone data is per-merchant (no global carrier tables at launch); calculated-rate adapters carry their own budgets.
