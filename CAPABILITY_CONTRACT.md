# CAPABILITY_CONTRACT.md — Commerce › Catalog Management (Sub-Capability 01)

**Framework:** MCEF-001 Phase 1. **Bindings:** Platform Bible, Constitution, BCA-001, VSA-001, PDS-001, OA-001, ADR-001/002/002-A, BLUEPRINT-001/002, Merchant Kernel, Shared Kernel.
**Status of the code:** Catalog Management is **substantially implemented and tested today** (`domains/commerce/catalog/`, migrations 0004/0005). This contract *ratifies* the built capability as permanent and specifies its complete boundary. Items marked **[built]** exist; **[deferred]** / **[conflict]** are addressed in Phase 2.

| # | Field | Definition |
|---|---|---|
| 1 | **Name** | Commerce › Catalog Management |
| 2 | **Mission** | Let a merchant author what they sell — products, variants, prices, media, attributes — as the single source of truth every downstream selling capability reads. |
| 3 | **Business outcomes** | A product exists, is valid, and is *ready to be listed*; authoring takes minutes, not manuals. |
| 4 | **Strategic outcomes (OA-001)** | O1 frictionless launch, O2 first-sale-sooner (a catalog is the prerequisite), O4 growth (catalog breadth). |
| 5 | **Value streams (VSA-001)** | VS2 Launch a Business (primary), VS3 Make a Sale (enabling), VS7 Discover (feeds), VS9 Save (variant pricing). |
| 6 | **Primary actors** | Merchant + staff (human & `ai_agent` principals with `ai_policy`). |
| 7 | **Upstream capabilities** | C2 Merchant (business/store/staff/entitlements/standing — the gate context). C1 Identity (actor). Shared Kernel (`Money`, `MediaRef`, `AIProvenance`, events). |
| 8 | **Downstream capabilities** | C3 Listings, C3 Inventory, C3 Offers, C4 Orders, C10 Discovery — all *read* catalog via events/queries; none reach into its tables. |
| 9 | **Published domain events** [built] | `commerce.product.created / .updated / .archived`, `commerce.variant.added / .updated / .price_changed`, `commerce.product.media_added / .media_removed`. |
| 10 | **Consumed domain events** | None required for authoring today. (Future: `store.published` context for cross-checks — via read model, not sync.) |
| 11 | **Public APIs** | None. Per the prompt, no public storefront/API. Catalog is authored through authenticated merchant endpoints only. |
| 12 | **Internal APIs** [built] | `POST /api/v1/products`, `PATCH /products/:id`, product lifecycle, variant + media + option sub-commands, `GET` product queries — all triple-gated, Idempotency-Key, RFC 9457, tenant-masked. |
| 13 | **Aggregate roots** [built] | `Product` (owns its `Variant` children, `Option` VOs, media refs). |
| 14 | **Value objects** [built] | `ProductTitle`, `ProductDescription`, `CategoryReference`, `FulfillmentKind`, `Option`/`OptionValue`, `Sku`, kernel `Money`, `MediaRef`, `AIProvenance`. |
| 15 | **Policies** [built] | `SellableSpecification`, `ProductReadinessSpecification`, `product-validator` (rehydration + newborn guards). |
| 16 | **Business rules** [built] | one business owns a product; SKU unique within the aggregate (business-wide unique = DB line); options ≤3, variants ≤100, media ≤50; category is an opaque valid reference; price is `Money` (bigint minor units, never float). |
| 17 | **Invariants** [built] | I1–I11 in `product.ts` — incl. SKU uniqueness (I4), bounded collections (I11), category-format validity (I10), archived-is-terminal, every product ≥1 variant. |
| 18 | **Security boundaries** | triple gate (RBAC→entitlement→trust/standing) on every mutation; cross-tenant → 404 mask; no cross-domain FK; audit on every state change. |
| 19 | **Performance targets** | product read p95 < 100ms; author-write p95 < 300ms (inherits kernel budget); catalog list keyset-paginated. |
| 20 | **Scalability targets** | 100M products (ADR-002 §17): `business_id`-leading indexes, hash-partition-ready `products`/`variants`; catalog is write-light/read-heavy → read models when Discovery lands. |
| 21 | **Observability** | correlation-ID-stamped events end-to-end; author-funnel metrics (product created→ready); structured logs, no PII in logs. |
| 22 | **Audit** | append-only `commerce_audit_logs` (month-partitioned, grant-immutable) on create/update/archive/variant/price/media. |
| 23 | **Test strategy** [built] | unit (aggregate invariants, VOs, factory, event emissions), integration (product API over embedded PG: create→event→outbox→audit, tenant masking, idempotency, readiness). |
| 24 | **Rollback strategy** | forward-only migrations; endpoints additive; read models disposable/rebuildable; a bad release is reverted at the app layer without data surgery. |
| 25 | **Definition of Done** | architecture-compliant, all gates green, security + performance reviewed, outcome metrics wired, CTO-approved. |
