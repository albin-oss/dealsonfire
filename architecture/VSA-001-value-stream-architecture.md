# VSA-001 — DOF Value Stream Architecture Handbook

**Status:** Permanent strategic artifact. The bridge between business strategy and engineering: how value *flows* through DOF.
**Altitude:** Value Streams. `Value Stream → Capability → Feature → Page → Code`. A value stream is a flow that produces measurable value for a user; capabilities (BCA-001) *enable* streams; they are not the same thing.
**Bindings:** Platform Bible, Engineering Constitution, **BCA-001** (capabilities C1–C17), DPS-001 (platform spec), ADR-001/002/002-A. Does not contradict them; it composes BCA-001's capabilities into value flows. Capability IDs below reference BCA-001.

---

## 1. Primary Value Streams (example list challenged)

The prompt's list mixes altitudes and overlaps ("Become a Merchant" / "Launch a Business" / "Grow a Business" are three phases of one lifecycle; "Sell a Product" and "Receive Payments" are stages of one loop). Refined into **12 distinct streams in 3 arcs**, each a flow that ends in measurable value:

**Merchant arc** — a person becomes a thriving business
- **VS1 Become a Merchant** — *why:* there is no value until a trusted seller exists. Value = an account that can act.
- **VS2 Launch a Business** — *why:* the Five-Minute Business is DOF's signature promise. Value = a live store.
- **VS3 Make a Sale** *(list → order → get paid → fulfill)* — *why:* the core revenue loop; the moment DOF earns its keep. Value = money in the merchant's pocket, goods to the buyer. (Absorbs the example's "Sell a Product" + "Receive Payments" — they are stages of one loop, not two streams.)
- **VS4 Grow the Business** — *why:* Opportunity First made continuous. Value = a next action that raised revenue.
- **VS5 Build an Audience** — *why:* social commerce = relationships, not just transactions. Value = a returning, engaged buyer.
- **VS6 Scale Operations** — *why:* success must not break the business. Value = more volume handled without more chaos.

**Shopper arc** — a person finds, trusts, and buys
- **VS7 Discover Products** — *why:* nothing sells if nothing is found. Value = the right product surfaced.
- **VS8 Buy with Confidence** *(cart → checkout → pay → receive)* — *why:* the shopper's revenue loop. Value = a completed, trusted purchase.
- **VS9 Save Money** — *why:* deals are the namesake ("Deals On Fire"). Value = a purchase the shopper felt smart about.
- **VS10 Resolve an Issue** — *why:* trust is kept at the failure moment, not the happy path. Value = a problem fixed, relationship retained.

**Platform arc** — the marketplace stays trustworthy and governed
- **VS11 Earn & Enforce Trust** — *why:* a marketplace is only as valuable as its trust. Value = verified sellers, removed bad actors. *(Cross-cutting: also a "trust moment" inside every other stream.)*
- **VS12 Govern the Platform** — *why:* the operating system needs operators. Value = policy applied, incidents resolved, taxonomy healthy.

---

## 2. Capabilities per Value Stream

`Owner` = the primary capability accountable for the outcome; `Supporting` = capabilities that participate.

| VS | Trigger | Desired outcome | Owner | Supporting | Key events | Success metric | Failure condition |
|---|---|---|---|---|---|---|---|
| VS1 Become a Merchant | Sign-up intent | Account that can act | C1 Identity | C2 Merchant, C13 AI (onboarding) | `user.registered`, `email.verified` | activation rate, time-to-verified | verify wall blocks selling; enumeration leak |
| VS2 Launch a Business | "Create my business" | Live store ≤5 min | C2 Merchant | C3 Commerce, C13 AI (Ignite), C9 Media | `business.created`, `store.published` | time-to-publish, launch completion | >5 min; handle dead-end; empty store |
| VS3 Make a Sale | Buyer checkout | Paid order, goods moving | C4 Orders | C3 Commerce, C5 Payments, C6 Fulfillment, C2 (trust gate) | `order.placed`, `payment.captured`, `fulfillment.started` | conversion, order accuracy, settled revenue | oversell; price drift; payment fail; unfulfilled |
| VS4 Grow the Business | Signal detected | A next action that raised revenue | C14 Analytics | C13 AI (Pulse), C3 (offers), C11 Notifications | `opportunity.detected`, `offer.launched` | insight→action rate, revenue lift | noise; manufactured urgency; ignored |
| VS5 Build an Audience | Post/follow | Returning engaged buyer | C8 Community | C9 Content, C11 Notifications | `spark.published`, `follow.created` | follows, repeat-visit rate | spam; noise; low reply |
| VS6 Scale Operations | Volume growth | More handled, less chaos | C7 Operations | C3 Inventory, C6 Fulfillment, C2 Staff | `location.added`, `stock.moved` | ops task completion, error rate | stockouts; routing errors |
| VS7 Discover Products | Search/browse | Right product surfaced | C10 Discovery | C3 Commerce, C13 AI (reco), C12 Marketplace | `listing.indexed`, `search.performed` | find-rate, discovery→purchase | irrelevant results; stale index |
| VS8 Buy with Confidence | Add to cart | Completed trusted purchase | C4 Orders | C5 Payments, C1 (guest), C3 (availability) | `cart.created`, `order.placed` | checkout conversion, guest→account | cart abandonment; checkout error |
| VS9 Save Money | Deal/coupon seen | A smart-feeling purchase | C3 Commerce (Offers) | C10 Discovery, C11 Notifications | `offer.applied`, `deal.started` | deal redemption, GMV on deals | fake discounts; expired offers shown |
| VS10 Resolve an Issue | Return/dispute | Problem fixed, trust kept | C4 Orders (returns) | C5 Payments (refund), C15 Trust, C11 Notifications | `return.requested`, `refund.issued`, `dispute.opened` | resolution time, retention after issue | slow refund; unfair outcome |
| VS11 Earn & Enforce Trust | Verify/report | Verified sellers, removed bad actors | C15 Trust & Safety | C2 (standing/trust), C13 AI (fraud), C16 Admin | `trust_level.changed`, `enforcement.applied` | time-to-action, false-positive rate | slow action; wrongful enforcement |
| VS12 Govern the Platform | Policy/incident | Policy applied, taxonomy healthy | C16 Administration | C15 Trust, C3 (taxonomy), all (read) | `entitlement.granted`, `taxonomy.changed` | policy SLA, audit completeness | ungoverned taxonomy; missing audit |

**Cycle safety:** every "supporting" contribution flows via events/contracts (BCA-001 §3). No stream requires a synchronous cross-capability call for a business decision.

---

## 3. End-to-End Journey Maps (each ends in measurable value)

- **Shopper:** discover (VS7) → trust the seller (VS11 moment) → buy with confidence (VS8) → optionally save (VS9) → receive → (if needed) resolve (VS10). **Value:** a completed purchase + a retained relationship. *Metric:* first-purchase conversion, repeat rate.
- **Merchant:** become (VS1) → launch (VS2) → first sale (VS3) → grow (VS4) → build audience (VS5) → scale (VS6). **Value:** sustained revenue. *Metric:* time-to-first-sale, monthly revenue retention.
- **Creator** (product = content): become → launch *digital-first* (VS2 tailored) → sell courses/memberships (VS3, `digital` FulfillmentKind) → build audience (VS5 as the primary channel) → grow via Pulse (VS4). **Value:** recurring audience revenue. *Metric:* subscriber growth, content→sale rate.
- **Brand** (registered, higher trust/scale): become → verify up the trust ladder (VS11) → multi-store launch (VS2×N) → sell at volume (VS3) → marketplace participation (VS7/VS12) → scale ops (VS6). **Value:** governed growth at scale. *Metric:* trust-tier progression, marketplace GMV.
- **Moderator:** triage queue (VS11) → review content/standing → apply enforcement hold (command) → recommend standing change. **Value:** a protected marketplace. *Metric:* time-to-action, appeal-overturn rate.
- **Administrator:** monitor platform health (VS12) → grant entitlements / govern taxonomy / resolve incidents (audited, step-up). **Value:** a healthy, compliant operating system. *Metric:* policy SLA, audit completeness.

---

## 4. Critical Moments (drive design & prioritization)

| Journey | First success | Activation | Trust | Retention | Growth | Delight |
|---|---|---|---|---|---|---|
| Merchant | store published | first sale | first payout received | returning revenue via Pulse | first staff/second store | Ignite "Reveal" — the store appears |
| Shopper | first product found | first checkout | seller verified badge + real availability | second purchase | follows a merchant | a Deal that felt genuinely smart |
| Creator | first course live | first subscriber | first payout | recurring subscribers | audience milestone | Pulse names a growing cohort |
| Brand | trust tier up | multi-store live | banking-verified payouts | marketplace repeat GMV | new region/channel | governed scale "just works" |
| Moderator | first queue cleared | steady triage rhythm | correct call upheld on appeal | low backlog sustained | policy template reuse | AI pre-triage saves hours |
| Administrator | first policy applied | console fluency | audit trail proves an action | stable platform health | taxonomy scales cleanly | anomaly caught before harm |

**Prioritization rule:** protect *first success* and *trust* moments above all — they gate every downstream stream. A regression in "first sale" or "seller verified" outranks any feature.

---

## 5. Capability Heat Map (contribution intensity)

●●● primary · ●● heavy · ● supporting · — none. Rows = value streams; columns = BCA-001 capabilities.

| VS \ Cap | C1 Id | C2 Mer | C3 Com | C4 Ord | C5 Pay | C6 Ful | C7 Ops | C8 Cmty | C9 Con | C10 Disc | C11 Notif | C13 AI | C14 Anlt | C15 Trust | C16 Adm |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| VS1 Become | ●●● | ●● | — | — | — | — | — | — | — | — | ● | ● | — | ● | — |
| VS2 Launch | ● | ●●● | ●● | — | — | — | — | — | ● | — | — | ●● | — | ● | — |
| VS3 Make a Sale | ● | ●● | ●●● | ●●● | ●●● | ●● | ● | — | — | — | ● | — | — | ●● | — |
| VS4 Grow | — | ● | ●● | — | — | — | — | ● | — | ● | ●● | ●● | ●●● | — | — |
| VS5 Audience | ● | ● | — | — | — | — | — | ●●● | ●● | ● | ●● | ● | — | ● | — |
| VS6 Scale Ops | — | ●● | ●● | ● | — | ●● | ●●● | — | — | — | — | — | ● | — | — |
| VS7 Discover | ● | — | ●● | — | — | — | — | — | ● | ●●● | — | ●● | — | ● | ● |
| VS8 Buy | ●● | — | ●● | ●●● | ●●● | ● | — | — | — | ● | ● | — | — | ● | — |
| VS9 Save | — | — | ●●● | ● | — | — | — | — | — | ●● | ●● | ● | — | — | — |
| VS10 Resolve | ● | ● | — | ●●● | ●● | ● | — | — | — | — | ●● | — | — | ●● | — |
| VS11 Trust | ● | ●● | ● | — | ● | — | — | ● | ● | — | ● | ●● | — | ●●● | ●● |
| VS12 Govern | ● | ● | ● | — | — | — | — | — | — | ● | — | ● | ● | ●● | ●●● |

**Bottlenecks & critical dependencies (read the columns):**
- **C3 Commerce** and **C4 Orders** are the busiest columns — they carry VS3/VS8/VS9. They are the platform's load-bearing wall; their correctness (price truth via the single `EffectivePriceService`, no oversell via the inventory ledger) underwrites the most streams.
- **C5 Payments** is high-intensity and highest-compliance — a single point whose failure kills VS3/VS8/VS10. Isolate and harden.
- **C15 Trust** touches many streams as *support* but must **own none of their models** (BCA-001 anti-god rule) — the heat map's breadth is exactly why that invariant matters.
- **C1 Identity** is thin-but-critical everywhere: low intensity, zero-tolerance failure.

---

## 6. Engineering Implications (per stream)

Ordered by dependency; each names its vertical slice, must-have integration test, observability, KPI, and future optimization.

| VS | Build order | Vertical slice | Integration test | Observability | KPI | Future optimization |
|---|---|---|---|---|---|---|
| VS1 | done | register→verify→session | enumeration-proof + verify-not-blocking | auth funnel, verify latency | time-to-verified | risk-based auth |
| VS2 | done | Ignite launch→publish | create→store→publish→event/outbox/audit | launch step timings | time-to-publish | AI drafting quality |
| VS3 | **next** | cart→order→pay(stub)→fulfill | oversell-race, price re-verify at checkout, reservation atomicity | order state transitions, payment success | settled revenue | split fulfillment |
| VS8 | with VS3 | shopper checkout (guest) | guest→claim, availability at checkout | checkout funnel | conversion | one-click, saved carts |
| VS7 | after VS3 | listing→index→search | live-only results, index freshness | query latency, zero-result rate | find-rate | ML ranking |
| VS9 | after VS3 | offer→effective price→apply | effective-price correctness across offers | offer apply rate | deal GMV | dynamic pricing (ADR-002-A §D) |
| VS4 | after data | signal→proposal→act | opportunity detection determinism | proposal accept rate | revenue lift | Pulse models |
| VS5 | growth | spark→follow→notify | moderation gate on content | engagement, opt-out | repeat visits | feed ranking |
| VS6 | growth | multi-location stock | transfer/routing correctness | stock accuracy | ops error rate | distributed inventory |
| VS10 | with VS3 maturity | return→refund→dispute | refund idempotency, dispute audit | resolution time | retention-after-issue | automated adjudication |
| VS11 | continuous | verify/report→enforce | enforcement ⊥ status (hold model) | time-to-action | false-positive rate | fraud ML |
| VS12 | continuous | grant/taxonomy/incident | audit completeness, step-up gating | policy SLA | audit coverage | policy-as-config |

**Cross-stream observability rule:** every stream emits a correlation-ID-stamped event trail end-to-end, so a single purchase can be traced across C3→C4→C5→C6 in one query. This is the funnel instrumentation that makes the KPIs real.

---

## 7. Governance — features must strengthen streams

1. **Every feature names the value stream(s) it strengthens.** A feature that maps to no stream is rejected — DOF ships value flows, not disconnected screens.
2. **A feature may not weaken a first-success or trust moment** (§4). Regressions there block release regardless of the feature's own merit.
3. **New value flows compose existing capabilities before proposing new ones.** A stream is realized by orchestrating BCA-001 capabilities via events; inventing a capability is a BCA-001 amendment, not a shortcut.
4. **Vertical slices, not horizontal layers.** Deliver a thin end-to-end slice of a stream (proven by an integration test that exercises the whole flow) before broadening — the pattern proven by Ignite (VS2).
5. **Instrument the stream, not just the feature.** No slice is "done" without its funnel event trail and KPI wired (§6).
6. **Money and trust streams get the highest correctness bar.** VS3/VS8/VS10/VS11 changes require the concurrency + audit tests their heat-map intensity demands.
7. **Cross-stream dependencies are explicit.** If a feature in one stream depends on another stream's event, that contract is reviewed (BCA-001 §3 cycle rule).

---

## Definition of authority
VSA-001 governs *how value flows* and *what to build in what order to create measurable value*. It is subordinate to BCA-001 (which capabilities exist) and DPS-001 (what the platform is), and it directs implementation without defining it. A new value stream, or a change to a first-success/trust moment, is a VSA-001 amendment with rationale and metrics.
