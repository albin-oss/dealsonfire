# DOF Platform — AMENDMENT-001

# Constitutional Amendment: Marketplace Trust Experience & DOF Signature Moments

**Status:** Ratified · **Date:** 2026-07-05
**Amends:** ADR-005 v1.0 → **v1.1** · UX-BIBLE-001 v1.0 → **v1.1**
**Method:** integrated throughout both documents (not appended); both now read as if the concepts were original. This record preserves the amendment's summary, scope, and recommendations.

---

## Executive Summary

**Amendment 1 — Marketplace Trust Experience.** Trust is reframed from a feature (badges, ratings) to the **invisible operating system of the marketplace**: every interaction builds, maintains, or restores trust — there is no trust-neutral interaction. The amendment adds *no trust mechanics* (the verification ladder, standing, escrow, and enforcement jurisdiction of ADR-001 §10 / Administration remain frozen); it defines the **experience and orchestration law** over those mechanics: merchant trust as an evidence-based *track record* (never a score, never purchasable, repair visible, new-with-dignity); buyer trust as ambient safety *answered before asked* (verified-purchase reviews, defended delivery promises, plain-language privacy, platform-vouched cold starts); community trust as authenticity-over-volume with anti-manipulation as product physics; and AI trust as the *glass engine* — every Ignite recommendation must answer the **explanation quartet** (why · evidence · confidence · **assumptions**, the newly added proposal part), with visible autonomy self-demotion after reversals and self-reported AI mistakes. **Trust Recovery becomes a first-class product experience**: Recovery Journeys (P5 sagas of repair) with four laws — speed beats polish, disclosure beats discovery, the merchant stays the author, repair ends with prevention.

**Amendment 2 — DOF Signature Moments.** DOF moves from completing tasks to **witnessing progress**: memorable, emotionally specified experiences at real milestones, derived from the event store (never scheduled by marketing, never gamified). A three-tier intensity system (**Ceremony** — a handful per merchant lifetime · **Card** — a few per month · **Whisper** — the default) under strict anti-noise laws (rare, earned, personal, skippable, once-only via the Moment Ledger, well-timed). The registry covers the full merchant journey (first store → first sale → repeat customers → anniversaries), the customer journey (finds, savings, following, belonging — always honest math), community moments (celebrated with consent), and — distinctively — **recovery moments**: comebacks without guilt, repaired launches honored with their history, resilience markers ("you kept a customer most shops would have lost"). Ignite participates as a witness with evidence, never a hype machine: warmth through specificity, at most one riding proposal, and celebration is never an engagement tactic.

---

## Sections Modified

**ADR-005 v1.1** — Header/authors (+Chief Trust Officer) · §0.6–0.7 (new challenges: trust as physics; witnessed progress) · §1.1–1.3 (moment ledger in owned state; no trust facts owned; provenance as AI-trust substrate) · §2.1 (proposal anatomy + **Assumptions**; explanation quartet) · §2.4 (autonomy self-demotion) · **§2.5 new: Recovery Journeys** · §3.3 (born trustworthy; platform-vouched cold start) · §4 (two-step policy as buyer-trust foundation) · §5.1 (imported reputation displayed, never blended) · §6.1 (trust surfaces reveal at natural motivation) · §7 (fulfillment record from ordinary work; defended delivery promises; returns as trust surface) · §8 (quartet in grounding rules; trust-repair drafting + milestone recognition capabilities) · **§9 new: The Trust Fabric** · **§10 new: Signature Moments — Ignite as Witness** · §11 (persona-skinned trust surfaces) · §12 (trust records as agentic-era collateral; moment ledger as merchant memoir) · §13 (+2 boundaries: not a judge, not a hype machine) · §14 (trust + moment metrics; dismissal rate as celebration-inflation alarm) · §15 (+4 reconciliation rows 11–14) · §16 (+I-15…I-20). Renumbered: Personas §9→§11, 2035 §10→§12, Boundaries §11→§13, Metrics §12→§14, Conflicts §13→§15, Decisions §14→§16.

**UX-BIBLE-001 v1.1** — Header/authors · §0.2 (delight → Signature Moments framing) · §0.4 (new challenge: trust as substrate) · §1.2 (safety as substrate emotion) · **§1.5 new: the twin promises** (the bible's acceptance test) · §2 (+principle #13) · **§3 new: The Trust Fabric — How Safety Feels** (buyer/merchant/community/AI trust, signal rendering rules, repair choreography §3.6) · §4.3 (trust numbers exact and sourced) · §6.4 (customer-touching failures open Recovery Journeys) · §7.1–7.4 (assumptions in the voice; self-report; fatigue-approval as counterfeit trust) · §8 (born-trustworthy substrate under the genesis score) · §9 (community trust felt in the braid) · §10 (promises kept; sturdiness as trust's quietest signal) · §11 (trust signals share the calm dress code) · **§14 expanded: Signature Moments** (laws, tiers, full registry with per-moment emotional objective/feeling/timing/pacing/intensity, customer + community + recovery moments, Ignite's part) · §15 (+anti-patterns 13–15: never sell trust, never counterfeit social proof, never stage a failure) · §16 (+X-13…X-17). Renumbered: §3–§15 shifted by one (Delight §13 → Signature Moments §14).

---

## New Constitutional Principles

1. **Every Interaction Moves Trust** (UX-BIBLE-001 §2 #13) — build, maintain, or restore; no trust-neutral interactions; earned never purchased; records never theater.
2. **The Explanation Quartet** (ADR-005 §2.1/§9.4) — why · evidence · confidence · assumptions, mandatory on every AI recommendation; an unexplainable recommendation does not ship.
3. **Repair Is the Product** (ADR-005 §2.5, UX-BIBLE-001 §3.6) — trust recovery is a designed, first-class experience with four laws; staging failures for recovery theater is a firing offense.
4. **Witness, Don't Perform** (ADR-005 §10, UX-BIBLE-001 §14) — moments are event-derived, budgeted by intensity tier, once-only, and never an engagement tactic.
5. **The Twin Promises** (UX-BIBLE-001 §1.5) — "I feel safe buying here" / "I feel confident running my business here" as the universal acceptance test.

## Changes to the Long-Term Platform Vision

The 2035 agentic-commerce bet (ADR-005 §12) gains its missing collateral: **event-verified, third-party-verifiable trust records**. When buyer agents negotiate with merchant Ignites, the un-fakeable track record — derived from a decade of immutable domain events, not asserted — is what agents underwrite. Two new named rooms: trust-record projections designed for eventual external verifiability, and the Moment Ledger as the seed of the decade-long merchant memoir.

## Recommendations for Future Architecture & Implementation

1. **Trust-record projection (read model)** — when Orders/Fulfillment domains land, define the track-record projection (on-time rate, resolution times, repeat-customer rate) in `contracts/` as published language from day one; it must be derivable purely from domain events (verifiability requirement, I-20).
2. **Proposal schema v1** — implement the proposal contract with the Assumptions field from the first Ignite blueprint; do not retrofit the quartet.
3. **Moment Ledger + moment detection** — a thin Ignite consumer over existing event streams; requires no domain changes. Ship first-sale and launch Ceremonies with the first order-capable release; everything else can follow as Whispers in the digest.
4. **Recovery Journeys need the Orders domain** — the delivery/oversell/dispute journeys are the strongest argument for prioritizing Orders + a minimal fulfillment-event vocabulary in the next architecture cycle (aligns with ACCEPTANCE-001's taxonomy-next and ADR-003's implementation-order guidance; revisit ordering there).
5. **Review authenticity is structural** — when Reviews are designed (Community/Commerce boundary), verified-purchase must be a schema-level invariant (review references order line), not a moderation flag.
6. **Metrics instrumentation** — add the §14 trust metrics (time-to-acknowledgment, recovery retention delta, moment dismissal rate) to the analytics domain's requirements now, so the events they need are emitted from the start.
7. **ADR-001 v1.2 housekeeping** — fold in the two soft amendments now pending: Pulse/Assistant unification (ADR-005 §15 row 5) and the three v1.0 + five AMENDMENT-001 principles, so the constitutional principle list lives in one place.
