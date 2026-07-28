# DOF Buyer Experience — DOF_SIGNATURE_EXPERIENCES

**Status:** For Founder approval (design only) · v1.0 · 2026-07-27
The experiences that are *unmistakably DOF* — each tested against the copyability challenge (could Shopify / Etsy / Amazon ship this?) and kept only where the honest answer is "not without becoming DOF."

---

## SX-1 · The Workshop Wait ⭐ (the flagship)
**What:** the order timeline interleaves the maker's public sparks from the buyer's wait window — the wait becomes the first chapter of owning the thing.
**Copyability:** Amazon — structurally impossible (no maker narrative exists; sellers are interchangeable by design). Shopify — impossible as a platform experience (no cross-store fabric; a single store could imitate weakly with email drips, which are push-marketing, not a window). Etsy — *could* build it, but only by first building a chronological maker-update stream tied to orders, which is DOF's whole street; copying the feature requires copying the platform. **VERDICT: native.**
**Ships:** C5/C6 (buyer timeline) — a read-time join of two existing streams.

## SX-2 · The Biography of the Thing
**What:** every completed order page settles into a keepsake: the letter, the wait-window sparks, the promise made and kept (with dates), the parcel photo, the maker's sign-off. Order history becomes a shelf of stories; "who made your blanket?" has a durable answer.
**Copyability:** Amazon — no story to preserve. Etsy — has fragments (shop, convo) but no promise-record spine to hang them on; its order page is a receipt. Shopify — per-store impossible as fabric. The biography is downstream of THREE frozen DOF decisions (immutable order + timeline, promise snapshots, spark stream) — copying it means copying ADR-007. **VERDICT: native.**
**Ships:** progressively — C3 (letter) → C5 (timeline) → C6 (parcel photo, delivery facts). No storage cost: it is a *rendering* of records already kept forever.

## SX-3 · The Handover
**What:** arrival attributed to hands: "Delivered — 2 days ahead of Rosa's promise," above the parcel photo taken as it left hers. The courier vanishes from the story; the maker keeps the credit.
**Copyability:** any platform could phrase delivery warmly; none can *attribute a kept promise* without a per-merchant promise record. **VERDICT: native in substance, copyable in tone — acceptable (tone was never the moat).**
**Ships:** C6.

## SX-4 · The Keystone Purchase
**What:** buying with "the maker isn't paid until it ships" beneath the button — protection that *aligns* buyer and maker rather than inserting the platform between them (contrast Amazon: protection BY replacing the seller).
**Copyability:** requires the payout-hold money design; Shopify structurally cannot (merchant-owned processing); Etsy/Amazon would have to re-architect seller payments. **VERDICT: native.**
**Ships:** C3/C4 (already approved).

## SX-5 · The Regular's Return
**What:** the second visit feels like returning to a stall: Home carries the maker's new spark with your history quietly present; the shop remembers ("you've bought here before"); the corner was already yours before you ever paid.
**Copyability:** recommendation engines imitate the *surface*; the difference is consent-architecture — DOF recognizes only deliberate acts (follow, claim, purchase), never inferred taste. Copyable by a platform willing to abandon behavioral targeting — i.e., none of the three. **VERDICT: native by values, defensible.**
**Ships:** exists (corner/follows) + C5 (purchase memory).

## Rejected signature candidates
**Live "making" video** — production theater; demands performance (violates L5). **Buyer-visible production progress bars** — falsifies craft rhythm into logistics UI; the spark stream already carries real progress in the maker's own cadence. **Handwritten-note marketplace add-ons** — outsourced intimacy; the greeting-card uncanny valley. **Platform-authored gift wrap upsells** — the stall's wrapping is care, not a SKU.
