# Product Aggregate — Design & Contract (IMP-COM-001)

**Lineage:** ADR-002 §4.1/§6/§10, BLUEPRINT-002 §2.1–2.3/§3, DECISIONS D-28.
**Scope:** the domain artifact only — persistence, APIs, and projections arrive in later sprints against the contracts defined here.

## 1. Shape

```
Product (aggregate root)                     one merchant-conceived sellable thing
├── Variant[] (child entities)               the units of sale — listings/inventory/orders point HERE
├── ProductMedia[] (child entities)          gallery composition (MediaRefs only; bytes are Media's)
├── Option[] (VO)                            declared axes; variants are points in this space
├── ProductTitle / ProductDescription / CategoryReference / ProductStatus (VOs)
└── AIProvenance (VO, merchant shared-kernel) which fields AI wrote, and who approved
```

Everything inside one aggregate because its invariants span the **set**: option-space
integrity and combination/SKU/media uniqueness need single-transaction enforcement
(ADR-002 §6). Hot fields are deliberately absent — stock lives in `inventory/`,
scheduled prices in `pricing/` (D2-5/D2-6): what remains changes at human editing speed.

## 2. Lifecycle & state transitions (machine 1 of 3 — ADR-002 §0.3)

```
            create (factory)          activate            archive
   [birth] ────────────────► DRAFT ───────────► ACTIVE ──────────► ARCHIVED
                               │                   ▲                  │
                               │ archive           └────── restore ──┘
                               └────────────► ARCHIVED
```

- **Draft** — real, invisible, safe to be wrong. Every product is born draft.
- **Active** — participates in selling. Reached via `activate()` (the publishing sprint
  calls it on first listing publish) or `restore()`.
- **Archived** — retired, data intact, **read-only except restore** (I9). `archive()` is
  idempotent (re-archiving is a no-op, no event — kernel idiom); `restore()` from any
  non-archived status is `INVALID_TRANSITION`.
- **"Ready"** is NOT a status — it is `ProductReadinessSpecification`, computed and
  explainable. **"Published/Hidden"** are LISTING states. **Deletion** is a repository
  tombstone concern (persistence sprint), never a status.
- Restore lands on **active** (D-28): an archived product necessarily left draft-hood;
  resurrecting it into invisibility would surprise merchants.

## 3. Invariants (I1–I11) — what, where, why

| # | Invariant | Enforced at | Why it exists |
|---|---|---|---|
| I1 | ≥1 variant always | factory (silent default variant) + validator | a product with nothing purchasable is a lie; the variant is what everything else references |
| I2 | Variant option keys = declared option names exactly; values declared | `addVariant`/`updateVariant`/`addOption` + validator | a variant outside the declared space is unrenderable and unorderable |
| I3 | No duplicate combinations | same + `removeOption` collapse check | two identical purchasables = data corruption; note corollary: zero options ⇒ exactly one variant |
| I4 | SKU unique within aggregate | add/update variant + validator | intra-aggregate line; business-wide uniqueness is the DB's (persistence sprint) |
| I5 | Option changes keep variants valid & distinct | `addOption` (explicit per-variant assignment — the domain never guesses whether the existing soap was Lavender), `removeOptionValue` (unused values only), `removeOption` (collapse must not merge) | option surgery must never silently corrupt the variant set |
| I6 | Media unique per (asset, scope); ≤1 hero per scope | `addMedia` + validator | the hero IS the scope's face; duplicates are UI bugs made durable |
| I7 | Media→variant references resolve | `addMedia` + validator | dangling references render broken galleries |
| I8 | Status transitions follow §2's machine | `activate`/`archive`/`restore` | the machine is the contract consumers project from |
| I9 | Archived = read-only except restore | `ensureMutable()` guard on every mutation | "illegal archive operations" — archived history must be trustworthy |
| I10 | CategoryReference format-valid, semantics-free | `setCategory` VO | K3: Taxonomy owns meaning; commerce owns only the reference |
| I11 | ≤3 options, ≤100 variants, ≤50 media | guards + validator | extension points, not physics — raising them is a product decision recorded here, not a bug fix |

## 4. Event flow

| Behavior | Events emitted |
|---|---|
| factory `createProduct`/`fromDraft` | `commerce.product.created` + `variant.added`×N + `product.media_added`×N |
| rename / description / category / options / reorder media / activate / restore | `commerce.product.updated` `{fields_changed[]}` (no-op changes emit nothing) |
| `addVariant` | `commerce.variant.added` |
| `updateVariant` | `commerce.variant.updated` + **`commerce.variant.price_changed`** when price/sale changed (old/new prices — ADR-002 §13's high-fan-out fact; see D-28 on the brief-vs-ADR resolution) |
| `archive` | `commerce.product.archived` (idempotent re-archive: nothing) |
| `addMedia` / `removeMedia` | `commerce.product.media_added` / `media_removed` |

Payload schemas are registered in `contracts/schemas/events/commerce-payloads.ts` and the
compatibility lock **now**, before any dispatcher exists — the M-6 gate covers commerce
from its first emitted event. Events use the platform envelope; ordering scope =
`business_id` (D-19); trace stamping happens at append (D-20) — the aggregate stays
request-context-free.

## 5. Concurrency

Exactly the Merchant Kernel pattern: no version field on the aggregate; command
transactions load via `ProductRepository.findById(tx, id, { forUpdate: true })`; the
per-aggregate `sequence` UNIQUE guard at event append turns lost races into conflicts
(D-15 family). The repository saves whole aggregates — no partial child writes.

## 6. Extension points (named now, built later)

- **Fulfillment kinds:** `digital`/`service` are first-class citizens today via
  `Variant.kindData`; booking/licensing capabilities attach to the same variants
  (ADR-001 §5.8-7) with zero model change.
- **Configurable products (2030s):** a new Option kind in `commerce/shared-kernel/option.ts`
  (ADR-002 §6), not a new model.
- **Bundles:** future composite Product kind (ADR-002 §4.7) — this aggregate is a leaf.
- **AI image swaps (Module 3):** target individual `ProductMedia` entities by id —
  the reason media are entities, not jsonb.
- **Limits (I11):** constants exported for policy override at Established/Enterprise tiers.

## 7. What is deliberately absent

Listings (publication/visibility — `publishing/`), inventory quantities (`inventory/`),
scheduled prices (`pricing/`), collections/offers (`merchandising/`), business-wide SKU
uniqueness and tier product-count caps (DB + command layer, persistence sprint), and any
persistence beyond the `ProductRepository` contract in `ports.ts`.
