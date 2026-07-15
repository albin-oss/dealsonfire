# VISIBILITY_CONTRACT.md — The Permanent Source of Truth for Product Visibility

**Status:** Binding platform contract (PROMPT-029). Every current and future capability — Deals, Search, Sparks, Orders, Advertising, Recommendations, Analytics — interprets visibility through this document and only this document.
**Companions:** ADR-002 §0.3 (three machines) / §9 (Listings), CER-001 CS1, UX-PUBLISH-001.

---

## 1–4. The four words, defined once

- **Published** — a fact about a **Listing**: the merchant's *standing intent* that a product be sellable on a channel. It is an explicit, audited act; it survives store pauses, product edits, and time. Intent, not outcome.
- **Unpublished** — that intent withdrawn. Also a Listing fact, equally explicit, equally audited. Never a punishment, never automatic (with one exception: §6 `ended`).
- **Visible** — a **computed** answer to "can a buyer see this product on this channel *right now*?" It is the conjunction — never a stored column:
  `visible(product, channel) = listing.published ∧ store.live ∧ store.hold = none ∧ product ≠ archived/deleted`
  (Future terms join the conjunction — inventory permitting (CS2), schedule windows — without changing its shape.)
- **Hidden** — `¬visible`, *for any reason*. Buyers never learn which reason: a hidden product is indistinguishable from a nonexistent one (404-masking law). "Hidden" is a buyer-side observation, never a state anyone sets.

**The golden rule:** merchants act on **published/unpublished** (intent). Buyers experience **visible/hidden** (outcome). No capability may ever collapse the two.

## 5. The relationship model
```
Merchant (person) —owns→ Business —owns→ Product   (authoring truth: what exists)
                              │
                              └—owns→ Store = today's only Channel   (place truth: where selling happens)
Listing = (Product × Channel) publication fact      (intent truth: what is offered where)
```
Exactly one Listing per (product, channel) — enforced by unique constraint. The Product never knows it is listed (authoring stays pure); the Store never knows what is listed on it (place stays pure); the Listing knows both and owns nothing else.

## 6. State transitions (the Listing machine — the third machine of ADR-002 §0.3)
```
(none) ──publishToStore──► published ◄──publishToStore─── unpublished
                              │                                ▲
                              └──unpublishFromStore────────────┘
published | unpublished ──product.archived──► ended ──publishToStore (after product restore)──► published
```
- `publishToStore` **auto-creates** the listing — merchants never manage listings as objects (the noun never surfaces).
- `ended` is the system's transition (product archived); republishing after restore is the merchant's. All transitions are detected-change: re-publishing a published listing emits nothing.
- Product status (`draft→active⇄archived`) and store status (`draft→live→…`) are **separate machines**; no transition here ever writes to them, and vice versa — only `product.archived` *signals* this machine, via event.

## 7. Published events (the only publication vocabulary any consumer may use)
`commerce.listing.published` · `commerce.listing.unpublished` · `commerce.listing.ended` — each carrying `{ listing_id, product_id, business_id, channel_id }`, schema-registered, emitted only on detected change, ordered per business.

## 8. Consumed events
`commerce.product.archived` → auto-end all of that product's listings (idempotent outbox consumer). Store lifecycle events are **deliberately not consumed**: store state is a live term of the conjunction, so listings need no synchronization with it (no dual-write, no drift).

## 9. Read-model implications
Any read surface answering buyer questions computes the §1 conjunction at read time (or serves a projection *built from the three listing events + the conjunction's other inputs*). The interim priced-⇒-public shelf rule is **retired by this contract**; no read path may ever infer visibility from price, product status, or anything but the conjunction.

## 10. Search — index on `listing.published`; remove on `unpublished`/`ended`. The index is a **hint**; the conjunction is re-checked at serve time (a search hit on a paused store returns nothing). Search never invents freshness or visibility semantics.
## 11. Deals — Offers target listings. An offer on a listing that becomes unpublished/hidden goes **dormant, never errors**, and wakes when visibility returns. Deals never force visibility ("publishing because a deal started" does not exist).
## 12. Sparks — conversation may reference any product, but renders buy-ability only when `visible` — a hidden product degrades to "no longer available" in the thread, never an error, never a leak of *why*.
## 13. Multi-channel (future) — a listing per (product, channel); identical machine, identical events (channel_id already in every payload). Publishing to the marketplace = a second listing row, zero new semantics.
## 14. Scheduled publication (future) — a `publish_at`/`end_at` on the listing; a worker performs the transition and emits **the same events**. Consumers never distinguish manual from scheduled — the schedule is an input, the events remain the vocabulary.
## 15. Security — commands triple-gated (`catalog.listing.write`); cross-tenant access 404-masked; hidden-reason never leaks to buyers (a held store's products are simply absent); enforcement hold gates the conjunction, never the listing state (T&S never mutates merchant intent).
## 16. Cache invalidation — the public storefront read carries `s-maxage=60, stale-while-revalidate` — worst-case 60s buyer staleness on any conjunction change, accepted and documented. The merchant's own verification link busts the cache (`?v=`). A future event-driven purge subscribes to the three listing events + store events; until then the TTL is the rule.
## 17. Audit — every publish/unpublish is audited (`commerce.listing.publish`/`.unpublish`, actor + target). `ended` is audited by the consumer as system action. The audit log is the answer to "who made this visible and when."
## 18. Performance — visibility is answerable in one indexed join (`listings(product_id, channel_id, status)` unique index + the store row); shelf reads p95 < 50ms; the conjunction adds no N+1 (one join per read, not per product).
## 19. Invariants
- **V1** Visibility is never stored — always computed (§1).
- **V2** One listing per (product, channel) — DB-enforced.
- **V3** Listing transitions never mutate product or store state (and vice versa).
- **V4** Events fire only on detected change; replays are silent.
- **V5** Publication never blocks authoring; authoring never implies publication.
- **V6** Buyers cannot distinguish *why* something is hidden.
- **V7** No capability introduces a second publication vocabulary — new needs extend the conjunction or the listing machine *here*, by amending this contract.

## 20. Examples
| Scenario | published? | visible? |
|---|---|---|
| Priced product, listing published, store live | yes | **yes** |
| Same, merchant taps "Take off my store" | no | no |
| Published listing, store paused by merchant | yes | no (returns when store resumes — intent survived) |
| Published listing, store under enforcement hold | yes | no (hold gates the conjunction, listing untouched) |
| Product archived | ended | no (listings auto-ended; restore + republish returns it) |
| Draft product, never published | no listing | no (and PR-2's UI shows "Not on your store") |
| New product created via Ignite/Composer with `publish_to_store` | yes | yes the moment the store is live |

---
**The closing guarantee (PROMPT-029's final question):** any future capability that needs to know *what a buyer may see* evaluates §1; *what a merchant intended* reads the listing state; *what changed* subscribes to §7. There is nothing else to know, and V7 forbids inventing it.
