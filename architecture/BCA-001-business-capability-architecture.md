# BCA-001 — DOF Business Capability Architecture Handbook

**Status:** Permanent strategic artifact. The capability model that governs DOF's evolution for the next decade.
**Altitude:** Business capabilities (stable functions), not domains/screens/code. Capability → Feature → Page → Code. Capabilities are long-lived; everything below them changes.
**Bindings:** Platform Bible, Engineering Constitution, ADR-001/002/002-A, BLUEPRINT-001, the approved Merchant Capability, DPS-001 (platform spec). This handbook does not contradict them; it organizes them into a capability map.
**Relationship to DPS-001:** DPS-001 answers *what the platform is* (apps, screens, journeys). BCA-001 answers *what the business does* (capabilities, ownership, sequence, governance). One is product shape; this is capability shape.

---

## 1. Capability Map (the example list, challenged)

The prompt's example list mixes altitudes (Media is part of Content; Search is the engine inside Discovery) and hides the decomposition ADR-002 already made (Commerce is the *selling side*; Orders/Payments/Shipping are distinct). The corrected map, in tiers:

**Tier 0 — Platform Foundation** (enabling; cross-cutting owner — see §6)
- **P0. Platform Services** — the shared kernel, eventing, persistence, config, observability, tenancy. Not a product capability; the substrate every capability runs on.

**Tier 1 — Foundational value**
- **C1. Identity & Access** — who you are, how you prove it, what you may do.
- **C2. Merchant** — business, store, staff, brand, trust, entitlements. *(Approved, Module 1.)*
- **C3. Commerce (Selling Side)** — catalog, variants, pricing, inventory availability, listings, offers. *(ADR-002; catalog built.)*

**Tier 2 — Transaction & operations**
- **C4. Orders** — cart, checkout, order lifecycle, fulfillment workflow.
- **C5. Payments & Payouts** — charges, escrow, payouts, refunds, compliance.
- **C6. Fulfillment & Logistics** — shipping rates, labels, tracking; digital/service delivery.
- **C7. Business Operations** — locations, stock movement, operational settings. *(Operations domain built.)*

**Tier 3 — Audience & growth**
- **C8. Community** — Sparks, comments, follows, merchant↔buyer conversation.
- **C9. Content & Media** *(merged — Media is Content's asset layer)* — product/store/spark content, media storage & processing, SEO.
- **C10. Discovery & Search** *(merged — Search is Discovery's engine)* — browse, search, recommendations, merchandising, marketplace surfacing.
- **C11. Notifications** — the right message, the right channel, calm by default.
- **C12. Marketplace** — DOF-wide discovery, cross-merchant trust, marketplace policy.

**Tier 4 — Intelligence & governance**
- **C13. Intelligence & AI** — Ignite (creation), Pulse (insight), commerce AI (drafting/pricing/dedupe). Advisory, human-controlled.
- **C14. Analytics & Insights** — business health as a sentence; signals, not dashboards. *(Pulse's data spine.)*
- **C15. Trust & Safety** — moderation, standing/enforcement, fraud, disputes. Spans capabilities; owns none of their models.
- **C16. Administration & Platform Governance** — entitlement grants, capability registry, taxonomy governance, incident response.
- **C17. Advertising & Promotion** *(far-future)* — promoted listings, merchant ad spend. Named now, deferred.

**Removed/merged with rationale:** *Media* → folded into C9 (an asset layer, not a capability). *Search* → folded into C10 (an engine, not a capability). *Commerce (monolith)* → decomposed into C3/C4/C5/C6 per ADR-002. *Analytics* kept distinct from AI (data spine vs. reasoning). *Advertising* retained but explicitly far-future.

---

## 2. Capability Definitions

Compressed to the load-bearing fields; full missions expand in each capability's future ADR.

| # | Mission (one line) | Primary users | Out of scope | Key principle | Success metric |
|---|---|---|---|---|---|
| C1 Identity | Prove who you are, gate what you do | All humans + AI agents | Merchant data, payments | Invisible Complexity | auth success %, account-takeover rate ≈ 0 |
| C2 Merchant | Turn a person into a business | Merchants, staff | Catalog, orders, money | Five-Minute Business | time-to-first-store, active businesses |
| C3 Commerce | Define what's for sale, where, at what price | Merchants, shoppers (read) | Cart/checkout, money, shipping | Platform Over Features | catalog integrity, price-correctness ≈ 100% |
| C4 Orders | Turn intent into a fulfilled transaction | Shoppers, merchants | Pricing truth, money movement | Grandma Test | checkout conversion, order accuracy |
| C5 Payments | Move money safely and compliantly | Merchants, shoppers, DOF | Catalog, order workflow | AI-First Human-Controlled (fraud) | payment success %, dispute/loss rate |
| C6 Fulfillment | Deliver the value (physical/digital/service) | Merchants, shoppers | Order lifecycle, pricing | Invisible Complexity | on-time delivery, delivery cost |
| C7 Operations | Run the day-to-day of a business | Merchants, staff | Selling model, transactions | Progressive Complexity | operational task completion |
| C8 Community | Let merchants and buyers talk | Merchants, shoppers | Content storage, moderation rules | Opportunity First | engaged follows, reply rate |
| C9 Content & Media | Hold and render the words and pictures | Merchants, shoppers | Commerce meaning of a product | Beautiful by Default | media availability, render latency |
| C10 Discovery | Help shoppers find what fits | Shoppers | Catalog authorship, ranking policy | Opportunity First | find-rate, discovery→purchase |
| C11 Notifications | Say the useful thing, quietly | All users | Message content authorship | Calm/Invisible Complexity | useful-open rate, opt-out ≈ low |
| C12 Marketplace | A trusted DOF-wide storefront | Shoppers, merchants | Individual store config | Platform Over Features | marketplace GMV, trust score |
| C13 AI | Propose; never decide irreversibly | Merchants, shoppers, admins | Being the source of truth | AI-First Human-Controlled | proposal-accept rate, override safety |
| C14 Analytics | Explain the business in a sentence | Merchants, admins | Making decisions for the user | Opportunity First | insight-action rate |
| C15 Trust & Safety | Protect the marketplace and its people | Moderators, admins | Owning domain models | AI-First Human-Controlled | time-to-action, false-positive rate |
| C16 Administration | Govern the platform itself | Administrators | Merchant business rules | (governance) | policy SLA, audit completeness |
| C17 Advertising | Amplify opportunities (far-future) | Merchants | Organic ranking integrity | Opportunity First (no dark patterns) | ROAS, organic-trust preserved |

---

## 3. Capability Relationships (acyclic)

Dependencies point **toward the foundation** (P0 → C1 → C2 → C3 → …) and toward **read-model consumers** (C10/C11/C14 are downstream of everything, sources of truth for nothing). Communication is **contracts + domain events**, never cross-capability table reads (ADR-004).

- **C1 Identity** — upstream of everything; downstream of nothing (owns the person).
- **C2 Merchant** — depends on C1; enables C3–C7. Owns business/standing/entitlements; emits standing/entitlement events all others react to.
- **C3 Commerce** — depends on C2; enables C4/C10/C12. Emits `listing.published`, `variant.price_changed`; consumes standing/entitlement.
- **C4 Orders** — depends on C3 (what/price), C1 (who); enables C5/C6. Commands reservations against C3's inventory ledger (C3 owns the ledger, C4 owns the intent — ADR-002 §2).
- **C5 Payments** — depends on C4; trust-gated by C2. Isolated compliance surface.
- **C6 Fulfillment** — depends on C4; switches on Commerce `FulfillmentKind` (ADR-002-A §B).
- **C8 Community / C9 Content** — depend on C1/C2; feed C10/C15.
- **C10 Discovery / C11 Notifications / C14 Analytics** — **consumers**: read models built from everyone's events; never write back.
- **C13 AI** — Open Host Service to all; advisory outputs carry `AIProvenance`; commits only via the owning capability's command.
- **C15 Trust & Safety** — acts *on* capabilities via commands (enforcement holds, standing recommendations) and reads via projections; **owns no other capability's model** (this is what keeps it from becoming a god-capability).
- **C16 Administration** — governs via commands + registry; reads via projections.

**Shared concepts** (defined once, in Platform Services / Shared Kernel): `Money`, `Actor`, branded IDs, `AIProvenance`, `MediaRef`, event envelope, `Result`/`DomainError`. No capability may redefine these (SHARED_KERNEL.md).

**Cycle prevention rule:** if C_a needs data C_b owns, C_a subscribes to C_b's events into its own read model — it never calls C_b synchronously for a business decision. Trust & Safety and Administration act by command, never by reaching in.

---

## 4. Capability Maturity Model

| # | P1 Foundation | P2 Growth | P3 Scale | P4 Enterprise |
|---|---|---|---|---|
| C1 Identity | password+passkey, sessions, verify *(built)* | SSO, org accounts | risk-based auth, device graph | SCIM, tenant federation |
| C2 Merchant | business/store/staff/brand/trust *(built)* | multi-store, richer roles | business graph, wholesale edges | franchise/org hierarchies |
| C3 Commerce | catalog/variants/media *(built)*; listings/inventory/pricing/offers *(designed)* | collections, offers, schedules | 100M products, price sets | bundles/subscriptions/rentals (ADR-002-A) |
| C4 Orders | cart→checkout→order | returns/exchanges | split/partial fulfillment | B2B POs, contracts |
| C5 Payments | charge, payout, refund | escrow, trust-gated payouts | multi-currency settlement | multi-entity, compliance regimes |
| C6 Fulfillment | flat-rate ship, digital delivery | carrier rates/labels | multi-location routing | distributed warehouses |
| C7 Operations | one location *(built)* | multi-location stock | routing/transfers | ops automation |
| C8 Community | Sparks, comments | follows, reactions | feeds at scale | creator programs |
| C9 Content/Media | product/store media | rich content, SEO | CDN scale, transforms | DAM, rights mgmt |
| C10 Discovery | store search | marketplace search, recos | billions of listings | personalization, ML ranking |
| C11 Notifications | email transactional *(built)* | multi-channel | preference center | orchestration/journeys |
| C12 Marketplace | published-store read model | curated marketplace | global marketplace | regional marketplaces |
| C13 AI | Ignite + rule stubs *(built)* | commerce drafting/pricing suggest | Pulse insights | agentic (scoped, audited) |
| C14 Analytics | health sentence | opportunity signals | real-time at scale | benchmarking |
| C15 Trust & Safety | standing+enforcement *(built)* | moderation queue | fraud models | appeals/adjudication |
| C16 Administration | entitlement/capability registry *(built)* | admin console | taxonomy governance | policy-as-config |
| C17 Advertising | — | — | promoted listings | ad platform |

---

## 5. Development Sequence (roadmap challenge)

The current roadmap (identity → merchant → commerce → …) is **correct**; I refine ordering *within* the next arc and justify it by the dependency graph:

1. **C1 Identity, C2 Merchant, C3 Commerce (catalog)** — *done/underway.* Rationale: nothing sells without a seller and something to sell. Enables everything.
2. **C3 Commerce (listings + inventory + pricing + offers)** — finish the selling side before transacting. Depends on C2; enables C4/C10/C12.
3. **C4 Orders** — the first revenue moment. Depends on C3 (price/availability truth) + C1. *Build before Payments* so the order state machine is proven with a stub settlement.
4. **C5 Payments** — money last among the transaction trio; highest compliance risk, so it follows a proven Orders shape. Trust-gated by C2 (already built).
5. **C6 Fulfillment** — parallelizable with C5 once C4 exists; switches on `FulfillmentKind`.
6. **C10 Discovery + C12 Marketplace** — only meaningful once catalogs and orders exist; both are consumers, so they lag producers.
7. **C8 Community, C9 Content, C11 Notifications** — grow engagement after the core loop closes; Notifications' transactional slice already exists and can advance early opportunistically.
8. **C13 AI (Pulse), C14 Analytics, C15 Trust at scale** — sharpen once there is real data and volume to reason over.

**Challenge accepted, one deviation recommended:** build **C4 Orders before completing every C3 offer type**. A merchant reaching *first sale* (the Five-Minute Business payoff extends to first revenue) matters more than shipping BOGO/bundles. Offers are additive to a proven order loop; the reverse is not true.

---

## 6. Cross-Cutting Concerns (owned by Platform Services, P0 — never by one capability)

| Concern | How it is shared | Enforcement |
|---|---|---|
| Observability (log/metric/trace) | Platform `logger/metrics/trace`, correlation IDs everywhere | one implementation, injected |
| Security | triple gate (RBAC→entitlement→trust), CSRF, headers, immutability | kernel + middleware |
| Audit | per-capability append-only quartet + `AuditLog` port | ADR-004, grant-enforced |
| Eventing | transactional outbox + partition-serial dispatch + `event_deliveries` | platform dispatcher |
| Error handling | `Result`/`DomainError` → RFC 9457 at the edge | shared kernel |
| Feature flags / Config | platform config readers; env validated | one config idiom |
| Localization / i18n | catalog + `Locale`/`Language`/`Currency` VOs at the edges | shared kernel |
| Accessibility | design-system primitives are WCAG-AA by construction | DS + a11y gates |
| Tenancy | `business_id` shard key leads every scoped table | ADR-004 |

**Rule:** a cross-cutting concern is *provided* by Platform Services and *consumed* by capabilities via ports. A capability never re-implements one (no bespoke logger, no local auth).

---

## 7. Enterprise Readiness — assessment & weaknesses

**Ready by construction:** tens of millions of users (stateless serverless + `business_id` sharding), millions of merchants (per-tenant isolation, no cross-domain FKs), multi-business-model (ADR-002-A polymorphism), public APIs (contract-first already the internal standard), AI agents (first-class `ai_agent` staff principals with `ai_policy`), acquisitions/third-party (per-capability event contracts + extraction-ready kernel).

**Weaknesses to address (with recommendations):**
1. **Taxonomy governance is unowned** (ADR-002 O2-1). *Recommend:* stand up C16 Administration's taxonomy function before C10 Discovery scales — Discovery inherits a vacuum otherwise.
2. **Multi-currency/region is designed but unproven** (price sets, per-region channel policy). *Recommend:* a currency spike inside C3 before C5 Payments settlement, so money truth and price truth align early.
3. **Immutability is role/grant-dependent** (TD-001). *Recommend:* the restricted-role deploy gate is an enterprise prerequisite, not a nicety — audit integrity underwrites Trust, Payments, and Administration.
4. **Trust & Safety could sprawl** into a god-capability. *Recommend:* the §3 rule — Trust acts by command/projection and owns no other model — must be a governance invariant, not a guideline.
5. **AI provenance must be universal.** *Recommend:* no AI output enters any capability without `AIProvenance` + human-apply; enforce at contract level.

---

## 8. Capability Governance Framework

Concise rules future engineers and AI tools must follow:

1. **A feature cannot exist outside a capability.** Every feature maps to exactly one owning capability; homeless features are rejected in review.
2. **A capability owns its business rules and its data.** No other capability reads its tables; access is by event or published contract only.
3. **Capabilities communicate through contracts and events**, never synchronous cross-capability calls for business decisions (§3 cycle rule).
4. **Shared concepts live in the Shared Kernel** and are defined once (`Money`, `Actor`, IDs, `AIProvenance`, envelope). Redefining one is a defect.
5. **Cross-capability dependencies require architectural review** — a new edge in the §3 graph is an ADR, not a PR comment.
6. **Cross-cutting concerns are consumed via ports, never re-implemented** (§6).
7. **Trust & Safety and Administration act by command/projection, never by reaching into another capability's model** (anti-god-capability invariant).
8. **AI is advisory, provenance-stamped, reversible, human-applied** — platform-wide, no exceptions.
9. **The capability map is stable; features churn beneath it.** Adding/splitting a capability is a BCA-001 amendment with rationale — the bar is high on purpose.
10. **Every capability names its future extension points before it needs them** (the language is ready before the feature) — the pattern proven in ADR-002.

---

## Definition of authority
BCA-001 is the permanent Business Capability Architecture Handbook. It governs *organization* (what capabilities exist, who owns what, how they relate, in what order they are built). It does not define implementation — capabilities are realized through their own ADRs/blueprints, each conforming to this map. Where a future capability document proposes a new capability or a new cross-capability edge, it amends BCA-001 explicitly with justification.
