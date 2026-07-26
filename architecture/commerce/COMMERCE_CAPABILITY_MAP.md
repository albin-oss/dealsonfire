# DOF Commerce Foundation — COMMERCE_CAPABILITY_MAP

**Status:** Blueprint for Founder Review · v1.0 · 2026-07-25
Every commerce capability, its owning domain, its authority, and its build status. "Frozen" = constitutionally designed, conform-only. "This blueprint" = decided here. "Seam" = structure reserved, feature unbuilt by law.

| Capability | Owner | Authority | Status | Increment |
|---|---|---|---|---|
| Guest cart | Orders/cart | ADR-007 §4 + §5.1 blueprint (dof_visitor key) | this blueprint | C1 |
| Authenticated cart | Orders/cart | ADR-007 §4 | this blueprint | C1 |
| Cart merge on login | Orders/cart | §5.1 (line-union, re-quoted, claim idiom) | this blueprint | C1 |
| Cart persistence / expiration | Orders/cart | §5.2 (server rows; 30d abandonment clock) | this blueprint | C1 |
| Multi-device continuity | Orders/cart | server-side cart, identity-keyed | this blueprint | C1 |
| Cart inventory awareness | Operations query | CDC-001 `AvailabilityQuery` (advisory only) | frozen | C1 |
| Cart discount application | Commerce | ADR-002 `EffectivePriceService` (re-quote on read) | frozen | C11 |
| Cart tax estimation | TaxPort | §5.3 | this blueprint | C3 (flat) / C10 (port) |
| Cart shipping estimation | Operations | SHIPPING_ARCHITECTURE §5 `ShippingQuoteQuery` | this blueprint | C6 |
| Checkout (guest + auth) | Orders/checkout | ADR-007 A7-2; CHECKOUT_STATE_MACHINE | frozen + detail here | C3 |
| Address management | Orders (snapshots) / Identity (book, future) | ADR-007 DeliverySnapshot; address book is a future Identity read model | this blueprint | C3 |
| Shipping selection | Orders quote ← Operations rates | SHIPPING_ARCHITECTURE | this blueprint | C6 |
| Payment selection | Payments tender plan | ADR-008 A8-3 (v1 one card leg, hosted fields) | frozen | C4 |
| Order review / confirmation | Orders | ADR-007 §5 | frozen | C3 |
| Checkout recovery / partial failure / retry | Orders saga | ADR-007 K1–K3; CHECKOUT_STATE_MACHINE §4–6 | frozen + detail here | C3 |
| Order lifecycle | Orders | ADR-007 §5; ORDER_STATE_MACHINE | frozen | C3–C6 |
| Payments (Stripe) | Payments | ADR-008; PAYMENT_LIFECYCLE | frozen + Stripe mapping here | C4 |
| Payment webhooks | Payments/providers | ADR-008 §6 (event-id ledger, per-intent order) | frozen | C4 |
| Refunds (full/partial) | Payments ← decisions from Orders/Operations | ADR-008 Refund aggregate; CDC-001 §2.3 choreography | frozen | C8 |
| Payment reconciliation | Payments | ADR-008 ReconciliationBatch (loud drift) | frozen | C4 skeleton, C12 hardened |
| Taxes | TaxPort (Orders composes, Payments never computes) | §5.3: v1 merchant settings; Stripe Tax adapter later | this blueprint | C10 |
| Shipping profiles / zones / rules | Operations/shipping | ADR-006 §84 (ShippingProfile/Zone/Rate, ZoneResolution) | frozen | C6 |
| Carrier integrations / tracking | Operations CarrierPort | ADR-006 | frozen (adapter registry) | C6 (manual) / later (live carriers) |
| Split shipments | Operations cases by (location, method) | ADR-007 A7-4 | frozen | C6 |
| Multi-origin fulfillment | Operations | same mechanism, more locations | frozen seam | future |
| Returns (request → resolution) | Operations ReturnCase + Orders link | CDC-001 §2.2/2.3; RETURNS_ARCHITECTURE | frozen | C9 |
| Partial return | per ReturnLine | RETURNS_ARCHITECTURE §5 | frozen | C9 |
| Exchange | linked new order | RETURNS_ARCHITECTURE §7 | seam | future |
| Inventory reservation / oversell prevention | Operations | CDC-001 §2.2 (frozen commands, TTL, commit race) | frozen | C2 |
| Release on timeout / payment failure | Operations TTL + Orders compensation | CDC-001 + ADR-007 K2 | frozen | C2/C3 |
| Order fulfillment | Operations FulfillmentCase | ADR-006/CDC-001 | frozen | C6 |
| Customer notifications | notifications seam | §5.4; DOMAIN_EVENTS §5 matrix | this blueprint | C7 |
| Merchant notifications | Pulse tasks (certainty-gated) + seam | ADR-007 A7-8 | frozen | C5/C7 |
| Discounts | Commerce Offers | ADR-002 §7 (Deals already ship on this substrate) | frozen | C11 |
| Coupons | Commerce Offers + code | code-bearing Offer; usage limits on the offer aggregate; checkout applies via EffectivePriceService; stacking: one code + automatic offers, best-for-buyer, explained by the trace | this blueprint | C11 |
| Gift cards | Payments liability tender leg | ADR-008 A8-3 (`buyer_credit` account kind named) | seam | future ADR |
| Subscriptions | future Scheduler → same placement path | COMMERCE_ARCHITECTURE §11 | seam | future ADR |
| Multi-vendor / marketplace money | Payments | ADR-008 A8-2 (Connect, fee legs, payouts, escrow from charge #1) | frozen | C4/C12 |
| Marketplace-wide cart | future composition | §11 (v1 = per-store cart) | seam | future |
| Escrow | Payments ledger state | ADR-008 A8-5 + ADR-001 trust ladder | frozen | C12 |
| Payouts | Payments | ADR-008 Payout aggregate (trust-gated) | frozen | C12 |
| Disputes / chargebacks | Payments | ADR-008 Dispute aggregate (evidence pre-assembled) | frozen | C12 |
| Buyer order history / guest lookup | Orders read models | ADR-007 §3 + buyer gate A7-7 | frozen | C5 |
| Customers-as-CRM | future read-model domain | ADR-007 §0.5 (never an Orders aggregate) | seam | future |

**Reading the map:** nothing in the launch path (C1–C12) requires a decision not already made here or in the frozen corpus. Every "seam" row names its future home and the structural hook that makes it additive.
