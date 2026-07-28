# DOF Buyer Experience — BUYER_EXPERIENCE_BLUEPRINT

**Status:** For Founder approval (design only; architecture frozen) · v1.0 · 2026-07-27
**Companion docs:** TRUST_MODEL (the theory) · JOURNEY (the path) · DECISION_POINTS (the moments) · INFORMATION_ARCHITECTURE (the screens) · SIGNATURE_MOMENTS (the memories) · CONFIDENCE_SYSTEM (the mechanics)

---

## 1. The one-sentence thesis

People don't buy from stores; they buy from **people they can observe being real** — so DOF's buying layer is built from observation, not assertion: a maker who is visibly present today, a money design that protects the buyer structurally, and (as orders accumulate) the uncompressed record of every promise kept.

## 2. What the incumbents teach, and where they fail

**Amazon** solved trust by *replacing* the seller — buyers trust Amazon's logistics and returns, and sellers became interchangeable. The cost: no seller identity survives; a maker's story is worth nothing there. DOF inverts this: the platform's structural protection (payout hold, automatic refund) plays Amazon's role *silently*, so that the merchant's identity can play the leading role.

**Etsy** proved buyers want makers, then buried them under a review-count arms race: 4.8 stars with 3,000 reviews beats a better maker with 12, so trust became purchasable and new makers face a cold-start wall. DOF refuses compressed ratings entirely (TRUST_MODEL §2 Class 4); outcomes are shown as counts with visible denominators, and *liveness* — which no one can buy in bulk — carries new shops.

**Shopify** gives merchants total identity and zero inherited trust: every checkout asks a stranger to trust another stranger's Visa form. DOF's street means no shop stands alone — the platform's money promise is one fabric across every storefront, stated at every decision point.

**The synthesis DOF builds:** Amazon's structural safety, stated honestly · Etsy's maker-first identity, without the ratings casino · Shopify's brand ownership, inside one trust fabric.

## 3. The experience, end to end (summary — detail in BUYER_JOURNEY.md)

1. **Arrival** (shared link or the street): within one screen, the buyer sees a *person* — name, voice, latest timestamped word, and a live shelf. Templated-store smell is designed out: brand palette, the merchant's own sentences, real recency.
2. **Consideration** (product page): the product leads; the maker's presence and the platform promise sit exactly where fear peaks — beside the price and the button (DECISION_POINTS §2).
3. **Commitment** (add to cart → checkout, C3): no signup wall; the keystone sentence at the moment of payment; every state honest.
4. **The wait** (C5/C6): the confirmation narrates what happens next in the merchant's voice; the timeline shows true case states; silence is never allowed to mean abandonment (promise-at-risk → proactive disclosure — the ADR-005 §2.5 journey).
5. **Arrival of the thing**: the loop closes by *witnessing the outcome* (delivery confirmation → promise-kept fact) — DOF's substitute for review-begging.
6. **Return visit**: the buyer now has history ("your maker posted this week"); trust compounds into relationship — the corner, follows, and (C5+) "you've bought from Rosa before."

## 4. Design laws for this layer

- **L1 — Show receipts, not conclusions.** Every trust element traces to a recorded event a buyer could in principle audit ("41 of 43" is clickable into anonymized order-date facts later, not a tooltip that says "trust us").
- **L2 — The platform whispers; the maker speaks.** Platform reassurance is one calm sentence in one consistent place, styled as DOF (trust dress-code: status colors are platform-owned). Everything else is the merchant's voice in the merchant's brand.
- **L3 — Honest absence.** Missing evidence is stated ("Opened this March — first orders will build this record") or the space is given to the platform promise. Nothing sparse is inflated; nothing embarrassing is hidden behind vagueness.
- **L4 — Fear-adjacency.** Signals sit next to the fear they answer, not in a trust ghetto page. Delivery confidence lives at the price; recourse lives at the button; accuracy lives in the photos/voice.
- **L5 — No new merchant homework.** Every signal is a by-product of behavior DOF already encourages (sparking, keeping promises, answering). The playbook may coach habits; the platform never demands trust-content chores.
- **L6 — Nothing ranks.** Trust facts never become sorting keys; the street stays chronological. (A trust-sorted street recreates the Etsy wall on day one.)

## 5. What is deliberately NOT designed here

Checkout screens (C3's job, under this layer's laws) · reviews/ratings (rejected, TRUST_MODEL §2) · buyer messaging (capability doesn't exist; seam noted) · public Q&A (designed seam, gated — CONFIDENCE_SYSTEM §6) · any AI-generated trust language (R-class law: words to buyers are R2-with-merchant-signature forever; trust *facts* are never AI-authored at all).

## 6. Build cost honesty

The pre-order layer (everything usable before C5) is composition: existing reads (momentum, sparks, engagement, opened-date) rearranged onto buyer surfaces per INFORMATION_ARCHITECTURE.md — roughly one Stream-B-sized increment, no schema changes, no new endpoints beyond one storefront-read enrichment. The outcome layer (promise ledger, repeat buyers, refund record) rides the already-planned trust-record projection (AMENDMENT-001 rec. 5 extension) — its buyer-facing surfaces land with C5/C6/C9 respectively, not before the facts exist.
