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
| 5 | **Visit the public storefront** | ⏳ **remaining** — see below |
| 6 | Pass all tests | ✅ 265 unit / 135+ integration / E2E green |
| 7 | Under five minutes | ✅ derived defaults, minimal typing, autosave/resume |

## Remaining DoD item: public storefront (step 5)
Today the success screen shows `dof.dev/:handle` and an in-Ignite `StorefrontPreview`, but there is **no public route** that renders a published store — this is the R1-B5 buyer surface in DPS-001. Plan (deliberately not built here to avoid a half-done public surface):
1. **Public read endpoint** `GET /api/v1/public/stores/:handle` — returns only `status='live'` stores (published brand kit + name); tenant-safe, cache-friendly (`Cache-Control`), no auth.
2. **Public page** `app/pages/s/[handle].vue` — SSR render of the published storefront config; 404 for non-live handles (no enumeration).
3. Wire Ignite's success CTA and the live-preview handle to the real public URL.
4. Tests: public read returns live only; draft/paused/handle-miss → 404; SSR snapshot.

This is a new public surface (§1 of DPS-001) and belongs in R1-B5; it reuses the same store data with no schema change.

## Performance & UX
- Progress autosaves (onboarding profile) and the journey resumes; abandoned drafts recover.
- Derived handles + sensible defaults minimize typing and decision fatigue (Grandma Test).
- Mobile-first single-column journey; live preview updates optimistically.
- No unnecessary requests: availability is checked on explicit handle edit (debounced), not per keystroke of the derived path.
