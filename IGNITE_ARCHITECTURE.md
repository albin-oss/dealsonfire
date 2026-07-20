# IGNITE_ARCHITECTURE.md — Vertical Slice 001 (Five-Minute Business)

Ignite turns "I have an idea" into a live, professional store in under five minutes. It is a **frontend experience over the approved Merchant Kernel** — it adds no business logic of its own; it orchestrates the kernel's create-business → create-store → brand-kit → publish commands. Complexity lives in the platform, not the user's mind.

## Shape
```
app/pages/ignite.vue                     the journey screen (welcome → reveal → success)
app/composables/ignite/
  journey.ts       the client state machine (steps, progress, back/next)
  intelligence.ts  IgniteIntelligence PORT + ruleBasedIntelligence stub (AI extension seam)
  launch.ts        LaunchService: calls the kernel APIs in order, narrated per step
  import-sources.ts the "bring an existing store" capability matrix
app/components/ignite/
  StorefrontPreview.vue  live preview of the store being born
  IgniteImportDoor.vue   connector picker
```
No Ignite tables, no Ignite domain — **it reuses Module 1**. This is the DoD "do not duplicate business logic" made structural.

## The launch flow (LaunchService → Merchant Kernel)
`launch.ts` executes, narrating each step and surfacing a resumable error if any step pauses:
1. `POST /api/v1/businesses` — create business
2. `POST /api/v1/businesses/:id/stores` — create store (handle derived; collision → numbered/random fallback, never a dead end — D-16)
3. `PUT /api/v1/stores/:id/brand-kit` — save the BrandKit (name, palette, voice)
4. `POST /api/v1/products` — seed the first product (so the store isn't empty)
5. `POST /api/v1/stores/:id/publish` — open the doors → `store.published` event → outbox → audit

Every write is triple-gated, idempotent (Idempotency-Key), audited, and event-emitting **inside the kernel** — Ignite gets those guarantees for free.

## AI extension points (interfaces only — no production AI)
`IgniteIntelligence` (in `intelligence.ts`) is the seam; `ruleBasedIntelligence` is the deterministic stub that ships. AI must never make an irreversible decision — every suggestion is a proposal the merchant can override before anything is created.
| Extension point | Interface method | Stub today |
|---|---|---|
| Store name suggestions | `readIdea()` → `IdentityDraft[]` names | curated name patterns |
| Color palette suggestions | `IdentityDraft.palette` | per-personality curated palettes |
| Brand description / voice | `IdentityDraft` tagline/voice | rule-based copy |
| Reveal (what DOF set up) | `reveal()` → `RevealItem[]` | category/shipping defaults |
| Logo ideas / SEO title | *reserved* on the port | to be added on first real provider |

Swapping in a real provider is implementing `IgniteIntelligence` and binding it — zero change to the journey or the kernel.

## Real-time handle availability (added this slice)
The one backend gap for "handle selection with real-time availability" is now closed:
- `GET /api/v1/handles/:handle/availability` → `{ handle, available, reason: ok|invalid_format|taken, suggestions[] }`
- `handleAvailabilityQuery` validates shape via `createHandle`, reads `store_handles` (advisory), and offers numbered suggestions when taken.
- `PgHandleLedger.lookup()` is the read; the **authoritative** claim stays the atomic `ON CONFLICT` in `HandleService.claimWithFallback` — availability is best-effort UX, never the race guard.
- Tests: 4 integration (free / taken+suggestions / invalid / 401) + the existing handle-service race unit tests.

## Definition of Done — status
| # | DoD step | Status |
|---|---|---|
| 1 | Start Ignite | ✅ `/ignite` |
| 2 | Create a business | ✅ LaunchService → kernel |
| 3 | Create a store | ✅ (handle fallback) |
| 4 | Publish the store | ✅ `store.published` + outbox + audit |
| 5 | **Visit the public storefront** | ✅ `/s/:handle` (UX-IGNITE Phase 3) — public live-only read + SSR page, 404-masked |
| 6 | Pass all tests | ✅ 265 unit / 135+ integration / E2E green |
| 7 | Under five minutes | ✅ derived defaults, minimal typing, autosave/resume |

## Public storefront (built in UX-IGNITE Phase 3)
The plan above shipped as designed:
1. `GET /api/v1/public/stores/:handle` — unauthenticated, LIVE-only (`status='live' ∧ enforcement_hold='none'`), redirect-handle aware, `Cache-Control` public, 404-masks draft/held/unknown/malformed identically (no enumeration). Composed at the container: merchant public face + commerce shelf, one read transaction.
2. `app/pages/s/[handle].vue` — SSR; the merchant's palette dresses the page via the same brand-kit cascade the Ignite preview uses (the preview and the real thing share the rendering idea); honest empty state while the shelf fills; 404 educating page otherwise.
3. Ignite's success CTA ("Visit your store") now links to `/s/:handle`; the share Opportunity copies the real URL.
4. Interim shelf rule (documented in `product-read-dao.ts`): non-archived products with a real price — the same bar the publish gate counts; switches to published Listings when CS1 lands (CER-001).
5. Tests: 4 integration (live 200 with brand+products / draft=unknown 404 parity / malformed no-DB-hit / draft products backstage).

## Performance & UX
- Progress autosaves (onboarding profile) and the journey resumes; abandoned drafts recover.
- Derived handles + sensible defaults minimize typing and decision fatigue (Grandma Test).
- Mobile-first single-column journey; live preview updates optimistically.
- No unnecessary requests: availability is checked on explicit handle edit (debounced), not per keystroke of the derived path.
