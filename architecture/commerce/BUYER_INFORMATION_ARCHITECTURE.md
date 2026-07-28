# DOF Buyer Experience — BUYER_INFORMATION_ARCHITECTURE

**Status:** For Founder approval (design only) · v1.0 · 2026-07-27
Per-screen information hierarchy for the buying layer. Everything here is composition of existing data unless marked ⧗ (arrives with the named increment). No new endpoints except the one storefront-read enrichment noted in §5.

---

## 1. The presence line (one component, everywhere)
`Rosa Knits · 23 people follow · posted 2 days ago`
— name (link) · social fact (only when >0) · liveness fact (latest spark/deal timestamp; falls back to "Making things since March" when quiet — never promotes staleness). One component, rendered identically on product pages, cart lines, deal pages, and (C3+) checkout and confirmations. Data: existing engagement + momentum reads.

## 2. Product page (the main stage)
**Above the fold:** photo hero · title · price · variant chips · presence line (NEW, under the store name) · availability truth ("Available now"; "New this week"; real stock number only when tracked AND ≤3).
**At the price (DP-2):** delivery expectation — merchant promise date now; ⧗C6 case-history range ("usually ships in 2–4 days") · ⧗C5 outcome counts ("41 of 43 arrived on time") / honest-newness line.
**At the buttons (DP-3):** merchant promise line (exists) · **keystone sentence** (⧗C3 — becomes true with real checkout; not shown before it is true).
**Below the fold:** description (voice) · **"From the maker" strip** (NEW): latest 1–2 sparks with photos + timestamps — the liveness proof at the exact place of doubt · More-from-shelf (exists) · story/promise block (exists, moves up one notch in visual weight).

## 3. Storefront
Current page already carries: tagline, follow + count, share, shelf with freshness, Latest-from strip, story/promise. **Additions:** presence line under the name · opened-date in the About block ("Making things in Antwerp since March 2026") · ⧗C5 the outcome block ("the promise record") between shelf and About — counts, denominators, quiet.

## 4. Cart (built, C1)
**Additions:** presence line per store section · delivery expectation per store (same source as DP-2) · the keystone sentence replaces "Checkout is almost here…" when C3 ships. Shipping cost appears here at latest (DP-2 rejection of surprise fees).

## 5. The one read-model change
The public storefront/product reads gain a `presence` object: `{ followers, last_posted_at, opened_at }` — all three facts already exist in other reads (engagement snapshot, momentum, listLiveShops); this merely lets buyer surfaces render the presence line in one fetch. Additive contract field; no schema migration.

## 6. Checkout (C3 — bound by this IA)
Order review screen hierarchy: the things (photos, not rows) → the promise date in merchant voice → totals with shipping/tax visible → keystone → pay. The merchant is never invisible at checkout: name + presence line persist in the header — buyers pay *Rosa*, through DOF.

## 7. Confirmation & timeline (⧗C3/C5/C6)
Confirmation letter (JOURNEY §7): next-event sentence · merchant sign-off (their promise line as signature) · order number quiet, bottom. Timeline: true case states in time-language, newest first; promise date always visible; at-risk disclosure inline when it happens.

## 8. The street (unchanged, on purpose)
No trust chrome on feed cards beyond what exists (fires, follows, timestamps). The street sells *presence*; the product page sells *confidence*; mixing them would clutter both. L6: nothing here ever ranks.
