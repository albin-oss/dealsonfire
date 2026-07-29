# DOF — OPERATIONS_REALITY_REVIEW (C6 Foundation)

**Status:** Completed 2026-07-29 · One adversarial pen wearing six hats: Marketplace Ops, Fulfillment, Merchant Success, Logistics, Support, Trust & Safety.
**Scope:** the operational model as it EXISTS at v1.34.1 plus C6's planned scope — reviewed as if real merchants, real buyers, and real mistakes arrive tomorrow. Engineering correctness was certified by PRR_C3_C5; this review asks whether the *humans* survive.

---

## Executive Summary

The foundation's honesty machinery (timeline, alarms, holds, masked gates) is real — but the review found that **the operational loop is not closed at either end**: the merchant surface omits the delivery address (a merchant literally cannot ship what they cannot address — every fulfillment journey dies at step zero), and the keystone sentence shown to every buyer ("if it doesn't ship, your refund is automatic") **currently has no enforcement mechanism** — no ship-by promise date, no aging clock, no refund primitive. A trust anchor without a mechanism is a lie with a delay. Both are correctable inside C6's already-approved scope without touching any frozen ADR. **Verdict: GO for continuing C6 — with the corrections below promoted from "C6 features" to "C6's definition of done," and the two immediate fixes landed before any other C6 code.**

**Operational Readiness Score: 58/100** as-is → projected 80 with C6-as-corrected. (The remaining 20: notifications (C7), cancellations/returns (C8/C9), support tooling — all already roadmapped; scored absent, not forgotten.)

## Critical Operational Risks

**ORR-C1 · The merchant cannot see where to ship.** `listBusinessOrders` returns `buyer_name` only — no delivery address, no buyer email. The workshop card says "Baby Booties, for Jonas, to make ready" and gives the merchant no way to make it ready. Found by walking the first journey ("merchant packs an order") to its first step. **Fix now:** the merchant order read and the workshop page carry the full delivery snapshot + buyer email (the fulfiller's access to fulfillment PII is legitimate, necessary, and already declared in the manifest's P2 rows).

**ORR-C2 · The keystone is currently unenforceable.** Live on three surfaces: *"The maker isn't paid until it ships — and if it doesn't ship, your refund is automatic."* Reality: no ship-by date exists on any order, no aging sweep watches, and `ProviderPort` has no `refund`. If DOF launched tomorrow, the first no-ship order would expose the promise as copy. **Fix inside C6 (promoted to definition-of-done):** (a) every confirmed order gets a ship-by promise (merchant default days, set at Ignite/store settings, snapshotted at confirm); (b) the three-step aging path — promise passes → merchant nudge task; +3d grace → buyer disclosure on the timeline; +4d further → **automatic refund** + order closed + loud alarm; (c) the minimal refund primitive (provider.refund, `refunded_minor` bounds already schema-CHECKed, reverse ledger posting). No new architecture: the sweep, the timeline, the ledger, and the alarm channel all exist.

**ORR-C3 · Hold release must not trust the shipped-mark alone.** v1 tracking is manual (a merchant claim). If `merchant_holding → merchant_payable` releases on the mark, "mark shipped, never ship" defeats the entire payout-hold shield. **Fix (C6 policy, one rule):** release at *delivered* when tracking confirms it, else at *shipped-mark + 7 quiet days* (no buyer flag). The quiet week is the manual-tracking substitute for carrier truth; the rule lives in one place and tightens later with real carrier integration.

## The scenario table (what happens · who decides · how DOF stays honest)

| Scenario | Today (v1.34.1) | With C6-as-corrected | Owner of the decision |
|---|---|---|---|
| Merchant packs late | nothing watches | promise passes → merchant nudge; buyer sees honest date slip at +grace | system nudges; merchant acts |
| Merchant forgets entirely | order sits "to make ready" forever | the full aging path ends in auto-refund + alarm | system (the keystone's enforcement) |
| Merchant disappears / illness / vacation | same as forgets | same path protects the buyer; resting-stall seam (gated) prevents new orders when merchant chooses | system; merchant pre-empts via vacation seam |
| Ships but forgets to mark | aging fires wrongly at merchant | the nudge asks "did this ship? mark it" BEFORE any buyer-facing step | merchant, prompted |
| Marks shipped, never ships | — | hold release waits 7 quiet days (ORR-C3); buyer's not-received flag (C9) reopens; payout shield intact | system holds money; support/C9 resolves |
| Wrong tracking number | — | manual edit of tracking on the case (C6 pack flow) | merchant |
| Split / partial shipment | designed (cases per line group, C6) | per-line states; buyer timeline says "2 of 3 on the way" | merchant packs; system narrates |
| Buyer address change post-confirm | no path; support burden | merchant has buyer email (ORR-C1 fix) — human coordination; formal edit flow deferred (C8 note) | merchant + buyer, directly |
| Cancel after packing / refunds (voluntary) | no path | C8 as roadmapped; until then support-mediated, refund primitive EXISTS after C6 (ORR-C2c) | merchant decides; C8 formalizes |
| Lost parcel / damaged / carrier delay | — | timeline note + C9 return/refund path; refund primitive ready | merchant decision card (C9) |
| Delivered but "not received" | — | C9 + dispute posture; payout timing (ORR-C3) is the shield | support + C9 |
| Digital products | fulfillment_kind exists, no branch | C6: digital lines grant instantly (no-op case, instant "it's yours") | system |
| Pickup orders | — | C6 method dial (pickup = no address leg, promise = ready-by) | merchant profile |
| Made-to-order delays | untracked = honest by default | merchant sets longer default promise days; aging respects it | merchant sets the promise |
| Oversell | solved (C2/C5 race machinery, tested) | unchanged | system |
| Parcel photo never uploaded | optional by design (never demanded) | unchanged — absence is fine | merchant |
| Buyer abuse (serial "not received") | — | v1 exposure accepted; hold window + C9 records + GA Radar | Trust & Safety at GA |

Every row's facts live in the order timeline + payment facts + domain events with correlation ids — **support can reconstruct any order in under two minutes with three queries** (now written down: `docs/runbooks/order-reconstruction.md`). What support *cannot* yet do is act (append notes, trigger refunds) without SQL — acceptable at First-Light scale, on the C8/Administration list.

## Merchant Friction
Before corrections: fatal (no address). After: the workshop card carries everything needed to pack — address, email, promise date, one honest state line. No training needed: the card IS the instruction. Residual friction: no bulk actions (fine at launch volume), no printed label integration (manual by design, v1).

## Buyer Friction
The timeline narrates the happy path well. Failure paths gain honesty with the aging disclosures. Residual: no buyer-initiated contact channel until C7/C8 — the order page will say what is true rather than pretend ("your maker sees this order and your email"). Ranked MEDIUM, C7 is the vehicle.

## Support Burden
Reconstruction: excellent (append-only everything). Action: SQL-only — the alarms (payment stuck, no-ship auto-refund) name exactly the manual steps. Burden concentrates in: address changes, courtesy cancellations pre-C8, and not-received claims pre-C9 — all listed with owners in the runbook.

## Failure Recovery
Every clock is a sweep, every sweep is idempotent, every terminal transition writes the timeline and (where money or stock diverge) alarms loudly. Nothing requires remembering; everything requires only that the cron ticks — which is itself the top operational risk already named in PRR (single cron topology).

## Operational Strengths
The payout hold is a genuinely load-bearing ops tool (most marketplace ops nightmares reduce to "the money already left") · append-only truth makes every dispute reconstructable · the workshop language means zero merchant training · the alarm posture (records humans must resolve, never silence) is already wired.

## GO / NO-GO

**GO** — with:
1. **ORR-C1 fixed immediately** (this commit): delivery + email on the merchant read and workshop card.
2. **ORR-C2 and ORR-C3 promoted to C6's definition of done** — C6 does not merge without the promise date, the three-step aging path ending in automatic refund, and the quiet-week hold-release rule.
3. The support runbook landed (this commit).
4. Experience Review re-run at C6 merge with the buyer-friction rows above as added checkpoints.
