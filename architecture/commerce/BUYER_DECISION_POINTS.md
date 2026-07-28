# DOF Buyer Experience — BUYER_DECISION_POINTS

**Status:** For Founder approval (design only) · v1.0 · 2026-07-27
The five moments where a purchase lives or dies, and exactly what must be true on screen at each. Fear taxonomy from BUYER_TRUST_MODEL §1.

---

## DP-1 · First contact (0–5 seconds on any public page)
**Decision being made:** stay or bounce. **Dominant fear:** F1 (existence).
**Must be true:** a human is visible within one glance — name + voice + a timestamp that is recent and real. **Must never be true:** default-template smell; placeholder text; a dead "last posted 8 months ago" leading (stale liveness is shown honestly but never *promoted* — the presence line prefers the opened-date over an embarrassing recency when the shop is quiet: "Making things since March" beats "posted 8 months ago").
**Instrument (Learning Ledger):** bounce within 5s on product pages, before/after this layer ships.

## DP-2 · The price moment
**Decision:** "is this worth the risk at this price?" **Fears:** F2 + F5.
**Must be true, within one eye-fixation of the price:** when it will arrive (case-history-derived range at ≥5 shipments; merchant promise date before that) · what other buyers' outcomes were (outcome counts at ≥3 completed orders; honest-newness line below threshold).
**Rejected here:** shipping-cost surprise deferral (cost shown before checkout, at cart at latest — surprise fees at payment are the #1 documented abandonment cause industry-wide, and hiding them is a dark pattern DOF refuses).

## DP-3 · The button hover
**Decision:** commit or flee. **Fear:** F4 (recourse).
**Must be true, directly beneath the actions:** the keystone sentence ("charged at purchase · maker paid on shipment · no-ship = automatic refund" — final legal wording pending, mechanics already true per PAYMENT_POLICY_DECISION) · the merchant's own promise line above it where one exists.
**Law:** the keystone is identical on every store (platform voice, L2) — buyers must learn it ONCE and recognize it everywhere; per-store variation would destroy its fabric value.

## DP-4 · The payment form (C3)
**Decision:** enter the card or abandon. **Fears:** F4 + a new one — F6, form-trust ("is typing my card here safe?").
**Must be true:** hosted Stripe fields (structurally true, SAQ-A) presented calmly — recognizable payment UI, no homemade card inputs · guest-first with no account wall before payment · the keystone repeated once, small, near the pay button · every error honest, specific, and loss-free ("nothing was charged; your cart is exactly as you left it").
**Rejected:** trust-badge rows (padlock icons, "100% secure" banners) — security theater that *lowers* perceived trust for exactly the audience DOF wants.

## DP-5 · The post-purchase 60 seconds
**Decision (emotional):** "was that smart?" — determines whether they tell someone, and whether they return.
**Must be true:** the confirmation letter (JOURNEY §7) with the next concrete event named and dated · the merchant's voice present · one-tap path back to the street (the moment of highest goodwill is the moment to meet the rest of the makers — organic, never a popup).

---

## Cross-cutting rejections at every decision point
Countdown timers, scarcity theater ("3 people are looking at this!"), urgency copy not backed by a real deal window, exit-intent modals, "only X left" unless it is the literal tracked stock number (which, per C2, DOF actually knows — *if shown, it is real and threshold-gated: shown only when ≤3 and tracked*). The absence of manipulation is itself a trust signal for this audience, and the street's no-algorithm law extends here: **no dark patterns, structurally.**
