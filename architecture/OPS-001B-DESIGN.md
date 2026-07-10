# DOF Platform — OPS-001B-DESIGN

# Inventory Tracking Policy & Merchant Experience

**Status:** Accepted (the implementation contract for the Stock Ledger sprint, OPS-001B) · **Version:** 1.0 · **Date:** 2026-07-07
**Authors:** CPO / Principal Inventory Architect / Principal UX Architect / Principal Domain Engineer / CTO (one pen)
**Binding docs honored:** ADR-001…ADR-006 · BLUEPRINT-003 v1.1 · OPS-001-BLUEPRINT · CDC-001 · UX-BIBLE-001 v1.1 · ADR-005 (Ignite 2.0) · DESIGN-SYSTEM-001 · DECISIONS.md (D-38/D-39 hardening laws apply to every aggregate this sprint builds).
**Contains:** no code, no schema, no API definitions — the operating model that OPS-001B implements. Where this document names commands/queries/events it is *restating* the frozen OPS-001-BLUEPRINT/CDC-001 surface, never widening it.

---

## 0. Challenges to the Brief (Read First)

### 0.1 Four "tracking modes" would fork the engine — they are Postures, and the domain never learns their names

The brief asks for Untracked / Simple / Managed / Enterprise modes. The domain's `TrackingMode` is frozen (`untracked | tracked | digital | service | made_to_order` — BLUEPRINT-003 §2, ADR-006 F-1), and ADR-006 **A6-2** already ruled that behavior-modes are unconstitutional: same architecture, Surface-Level presets. So this document defines the four as **Inventory Postures** — bundles of *visible capability + vocabulary + defaults* over one engine:

- The domain stores only its frozen enum plus facts (locations, thresholds, safety stock).
- A posture is **derived from facts, never stored as a mode column**: Untracked ⇔ mode `untracked`; Simple ⇔ `tracked` at the Ghost only; Managed ⇔ `tracked` + a second location or reservations live; Enterprise ⇔ Managed + counts/supplier/WMS surfaces revealed. There is nothing to migrate when a merchant "changes mode," because nothing changed except what reality already changed.
- Moving *between postures* is therefore free, bidirectional, and lossless by construction — the success criterion ("no migration to another system") is structural, not aspirational.

### 0.2 Three ladders, one merchant — keep the axes straight

The brief's persona Levels 1–3 are *merchant maturity*; Scale Tiers are *entitlement* (frozen); Surface Levels are *presentation* (ADR-005). Postures correlate with all three and equal none of them: a Level-1 baker on Growth tier stays Untracked until reality objects; a Level-3 operator's Enterprise posture is mostly S3 reveals plus the `ops.*` capabilities their tier already grants. Implementation law: **posture is computed for rendering; tier gates what may be created; surface level gates what is shown** — three reads, zero new writes.

### 0.3 The first five minutes are already solved — this design owns the second five

"Start selling in under five minutes without understanding inventory" is structurally true today: `untracked` is the constitutional default (∞ availability, zero nouns). The gap this document closes is the **second five minutes**: the day reality objects (a near-oversell, an import with quantities, a merchant asking "how many do I have left?"), the transition must feel like *the platform catching something*, not like a module unlocking.

### 0.4 Honesty about sequencing: Reserve/Commit/Release/Return are designed here, wired with Orders

Level 2 promises reservations; Orders does not exist (Phase B, BLUEPRINT-003 §0.3). This document specifies their merchant experience and domain behavior *as the contract Orders will trigger* — OPS-001B implements the ledger verbs that have Phase-A causes (receive, adjust, damage, recount, transfer-when-multi-location, import) and ships the reservation machinery dark behind CDC-001's frozen commands.

---

## 1. The Inventory Postures

| | **Untracked** | **Simple** | **Managed** | **Enterprise** |
|---|---|---|---|---|
| **Who** | Level 1: baker, crafter, hobbyist | Level 1–2: the first "how many left?" | Level 2: boutique, Shopify migrant | Level 3: multi-warehouse professional |
| **Domain state** | mode `untracked` | mode `tracked`, Ghost location only | `tracked`, 2+ locations and/or reservations live; safety stock optional | Managed + counts, supplier links, (future) POs/WMS adapters |
| **Merchant sees** | nothing — no counts, no thresholds, no "inventory" noun anywhere | one number per product ("12 left"), a low-stock reminder, "+/− and set" | locations by name, per-location numbers, transfers, "on the way," import/export | everything in Managed + count sessions, barcode, replenishment, safety stock, holds |
| **Hidden machinery** | availability = ∞ (the merchant never learns this word) | the ledger, buckets, the Ghost's existence, reason codes (rendered as sentences) | buckets beyond sellable/damaged, ATP math, reservation mechanics | nothing hidden that they ask for; the ledger stays Inspect-rung |
| **Entry** | default at birth | Ignite proposal (R2) at a trigger (§4) or merchant intent ("track this") — per product, never store-wide by force | second location created, or first reservation season (Orders live), or CSV with per-location columns | reveal triggers: count proposed after shrinkage signals; supplier surfaces after sourcing moments; barcode at volume (S2/S3) |
| **Exit / de-escalation** | — | DisableTracking (per product): balances freeze in history, ledger kept (S3 law), availability returns to ∞ — one honest confirmation, no data loss | close second location → posture recomputes to Simple automatically | surfaces retreat per ADR-005 §6.4 when unused |

**Movement laws:** (1) every upward move is *proposed with evidence or merchant-initiated* — never silent; (2) every downward move preserves history (the ledger is never erased — D-38/BLUEPRINT S3); (3) posture changes emit no special event — the underlying facts (`tracking_enabled`, `location.created`) *are* the events; (4) tracking is **per StockItem** (per variant×location), so one bestseller can be tracked while forty candles stay untracked — granularity is the anti-anxiety feature.

## 2. The Inventory Lifecycle — nine verbs, three truths each

Every verb below: what the **merchant expects** (the words), what the **domain does** (BLUEPRINT-003 mechanics), what is **emitted** (frozen taxonomy). Ledger law throughout: one balance change = one reason-coded movement line, same transaction (S2).

| Verb | Merchant expectation | Domain behavior | Events |
|---|---|---|---|
| **Receive** | "12 more arrived" — one tap from a Pulse card or the product page; optionally "from Rosa's Wholesale" | `+delta` sellable, reason `received`, optional supplier cause ref; lazily creates the StockItem (and Ghost) on first touch | `inventory.received` (+`tracking_enabled` if this was the tracking decision); threshold events if crossing upward (`restocked`) |
| **Adjust** | "−2, damaged" / "+1, found one" — a one-line story, never a form | `±delta` on a bucket, reason `adjustment` + sub-reason; negative-result attempts refused with educating copy | `inventory.adjusted`; `low_stock`/`out_of_stock` on downward crossings |
| **Reserve** *(Phase B)* | invisible — "someone's buying it" at most | Orders calls `ReserveStock` (CDC-001 §2.2): time-boxed claim against sellable−safety; strongly consistent, idempotent per order line | `reservation.created` |
| **Commit** *(Phase B)* | "Sold — 11 left" | reservation → `sold` ledger line atomically | `reservation.committed` + `inventory.adjusted(sold)`; threshold events |
| **Release** *(Phase B)* | invisible — the number quietly goes back up | claim freed (buyer abandoned / order cancelled); TTL expiry does this without anyone clicking | `reservation.released` / `reservation.expired` |
| **Return** *(Phase B)* | "it came back — good as new?" one decision: restock / damaged / discard | ReturnCase disposition writes the ledger pair: quarantine → sellable (`return_restock`) or → damaged bucket | `return.resolved` + `inventory.adjusted(return_restock)`; `restocked` if crossing |
| **Damage** | "dropped a box" — the −N, damaged story | sellable → damaged bucket move (paired lines, S5); damaged units never count toward availability | `inventory.condition_changed` *(registered when Batch 2 emits it)* |
| **Transfer** *(Managed+)* | "send 5 to the shop" — pick, send, receive; "on the way" in between | Transfer aggregate: `transfer_out` at source, destination `incoming` rises, `transfer_in` on receipt; variance recorded loudly, never rejected (T2) | `transfer.dispatched/received`; `inventory.transferred_out/in` |
| **Recount** *(Simple: "fix the number" · Enterprise: count sessions)* | "actually there are 9" — reality wins, no blame | absolute set ⇒ delta with reason `count`; below-promise clamps at zero and flags (S1) | `inventory.counted`-class `adjusted(count)`; **`oversold_detected`** when reality < promises → the Recovery Journey (ADR-005 §2.5) |

**The one sentence the implementer must not forget:** the merchant performs verbs; the domain writes ledger lines; the events are the same three names the taxonomy already froze per verb — no verb invents vocabulary.

## 3. Merchant Experience — sees / hides

**Grandma Test rendering rules (binding on the OPS UI sprint):**
- Quantity lives **on the product**, in the catalog the merchant already uses — there is no "Inventory module" door until Managed posture (tasks, not modules — ADR-005 §7).
- Adjustments render and *input* as stories: "−2 · damaged" — reason codes are vocabulary the UI translates both ways; the merchant never sees `adjustment/sub_reason=lost`.
- The **ledger is never a screen**; the "history" of a product's number is the Inspect rung (DofSheet biography: "Tue — 12 arrived · Wed — sold 3"), rendered from `ListMovements`.
- Low stock is a **Pulse task with the next step attached** ("Lavender Soap is down to 2 — reorder from Rosa's? · takes a minute"), never a red badge (UX-BIBLE §1.3).
- The Ghost stays invisible (D-39b); "locations" enters the vocabulary only when the second one exists; buckets beyond "damaged" (`on_hold`, `quarantine`) surface only where their verbs live (holds at Enterprise; quarantine only inside a return decision).
- Numbers policy: counts are exact integers; "∞/untracked" renders as *absence* (no number, no dash, nothing) — the absence of inventory UI **is** the untracked experience.
- Oversell is never a scold: the Recovery Journey opens with the honest options *and* the tracking proposal (the moment of the problem is the moment of the reveal — ADR-005 §6.1).

## 4. Ignite Integration (advise, never automate)

All rows: quartet mandatory, evidence cites the merchant's own events, data thresholds silence guesses, autopilot only as a bounded Standing Rule executing ordinary gated commands under the AI membership (CDC-001 §2.5).

| Question | Trigger (evidence) | Proposal (R-class) |
|---|---|---|
| **Enable tracking?** | oversell/near-miss (`oversold_detected`, out-of-stock complaint), an import carrying quantities, or velocity on a variant ("your bestseller sold 9 this week") | R2, per product, pre-filled with the opening count; declined = never re-asked for that product (Never Ask Twice) |
| **Another location?** | transfer-intent words in support/notes are NOT evidence — only structural facts: repeated pickup at a second address, popup creation, partner connect | R2 create-location proposal; Growth tier gate applies (creation only, D-39d) |
| **Safety stock?** | ≥2 stockouts on one variant within a season, or high variance vs lead time (needs supplier data — else silent) | R2 per variant, with the math shown ("you sell ~4/week; Rosa's takes 6 days; keeping 4 back prevents most gaps") |
| **Suppliers?** | the once-per-product natural moment (first receive: "where did these come from?" as an *optional* field), or a reorder proposal accepted twice | R0 record-keeping → R2 preferred-supplier |
| **Replenishment?** | tracked variant crosses threshold AND a supplier with lead time exists AND velocity data ≥ the honesty floor (~20 orders — ADR-006 §7) | R2 order draft; **Autopilot** only as a Standing Rule with explicit caps (max qty, max €/window) after the ADR-005 §2.4 earned-trust offer |

Never-automate list (restated from CDC-001): enabling/disabling tracking, closing locations, any count, anything step-up — proposals only, forever.

## 5. API Philosophy (restating the frozen surface — no additions)

- **Public merchant commands** (OPS-001-BLUEPRINT §6/§9): `EnableTracking` (opening count inline) · `DisableTracking` · `AdjustStock` (delta+reason, or absolute `counted` — the Simple posture's "set the number" maps here with reason `count`) · Batch 2 ships these; `Transfer*` and `Count*` commands ship with their posture sprints (OPS-004) but their contract names are already frozen.
- **Public queries:** `GetStock`/`ListStock` (buckets, mode, threshold) · `GetAvailability` (the projection; `null` = unlimited) · `ListMovements` (the biography, keyset).
- **Consumer commands** (CDC-001, Orders only): `ReserveStock`/`ReleaseReservation`/`CommitReservation` — built in Batch 2's aggregate, exposed when Orders lands.
- **Internal forever:** ledger writes (only `applyMovements`), bucket mechanics, ATP math, threshold-crossing detection, oversell detection, the projection maintenance, posture computation. No endpoint may ever accept a raw ledger line.

## 6. Success Criteria (measurable)

1. A new merchant reaches first-sale-ready with **zero inventory interactions** (untracked default — verified by the Ignite journey containing no inventory step).
2. Enabling tracking on one product is **one proposal approval or two taps**, never a settings journey; the opening count is the only question.
3. A merchant who gains a second location gets transfers *without asking* (posture recompute) and loses them cleanly if the location closes.
4. **Zero data-loss transitions:** enable→disable→enable preserves the full ledger (test-locked).
5. Level 1 → Level 3 requires **no export, no migration, no new product** — the same StockItems, richer verbs (the ADR-006 §5 coverage table, honored).
6. Ignite inventory proposals maintain the acceptance-rate health band and the reversal budget (ADR-005 §14) — a declined tracking proposal never reappears for that product.

## 7. Directives to OPS-001B (the contract bits beyond BLUEPRINT restatement)

**OD-1** Posture is computed, never stored — a pure function of (tracking facts, location count, revealed surfaces); UI-side, from public queries. **OD-2** Tracking granularity is per StockItem; store-wide enablement is a UI convenience that fans out to per-item commands (auditable individually). **OD-3** The Simple posture's "set the number" is `AdjustStock{counted}` (reason `count`) — count semantics from day one so recount behavior (clamp + `oversold_detected`) is uniform. **OD-4** DisableTracking requires one honest confirmation showing the frozen balances, keeps the ledger, and is AI-forbidden (CDC-001). **OD-5** Reservation machinery ships dark in Batch 2 (aggregate + commands built and contract-tested per CDC-001 §7; no caller until Orders) — building it with the StockItem prevents the retrofit that would break S4's in-aggregate race law. **OD-6** All D-39 hardening laws apply from the first line: canonical VO equality, jsonb-interior rehydration guards, the five test-class templates. **OD-7** Every UI string in §3 ships through the i18n catalog with the reason-code ↔ sentence mapping as data.

---

*OPS-001B-DESIGN in one sentence: one ledger wearing four coats — the baker never learns the word "inventory," the boutique gets locations the day reality does, the professional gets counts and replenishment, and not one of them ever migrates, because the coats were never the machine.*
