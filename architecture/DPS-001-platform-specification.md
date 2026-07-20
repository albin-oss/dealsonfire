# DPS-001 — DOF Platform Specification

**Status:** Authoritative master specification. Binds all future implementation.
**Bindings (upstream):** Platform Bible, Engineering Constitution, UX-BIBLE-001, ADR-001…008, BLUEPRINT-001…003, the approved & hardened Merchant Kernel, ADR-004 Data Constitution.
**Scope:** designs the whole platform. Contains **no code, no API, no schema** — those live in their ADRs/blueprints.
**North star:** *Opportunity First. Complexity Last.* A merchant should feel DOF is building a business with them, never that they are configuring software.

Legend: **[built]** exists today · **[roadmap]** designed here, not yet implemented.

---

## 1. Platform Information Architecture

### 1.1 Applications (surfaces)
| App | Audience | Auth | Status |
|---|---|---|---|
| **Storefront** (public buyer sites) | Shoppers | Public + guest tokens | [roadmap] R1-B5 |
| **Marketplace** (DOF-wide discovery) | Shoppers | Public | [roadmap] R2 |
| **Merchant Workspace** | Merchants + staff (human/AI) | Session (authenticated) | [built] core |
| **Ignite** (guided creation) | New/returning merchants | Session + guest-claim | [built] |
| **Admin Console** | DOF administrators | Session + admin scope + step-up | [roadmap] R2 |
| **Moderator Console** | Trust & Safety moderators | Session + moderator scope | [roadmap] R2 |
| **Account / Identity** | All humans | Public→Session | [built] |
| **Browser Extension / Mobile** | Merchants, shoppers | Session (token) | [roadmap] — §9 |

Each app is a **posture** of one design system and one API, not a separate frontend — the Surface Level model (S0…S3) and workspace layout already unify them.

### 1.2 Public vs authenticated
- **Public (no session):** storefronts, marketplace, `/login`, `/register`, `/verify`, `/forgot`, `/reset`, Ignite landing (guest). Public reads are cache-friendly and tenant-masked.
- **Authenticated (session):** the entire workspace (`middleware: auth`), all mutating APIs (triple-gated), admin/moderator consoles (additional scope + step-up for sensitive ops).
- **Guest (opaque token):** Ignite drafts and buyer checkout before account creation — claimable into an account later (identity claim pattern, [built]).

### 1.3 Route map (workspace — [built] unless noted)
`/` Home · `/onboarding` guided discovery · `/ignite` creation journey · `/products` · `/store` · `/orders` [roadmap R1-B5] · `/inventory` · `/customers` [roadmap] · `/deals` [roadmap] · `/coupons` [roadmap] · `/marketing` [roadmap] · `/shipping` [roadmap] · `/returns` [roadmap] · `/sparks` (community) [roadmap] · `/analytics` (Pulse) [roadmap] · `/settings`.
Auth routes: `/login /register /verify /forgot /reset`.
Admin/moderator: `/admin/*`, `/moderate/*` [roadmap].

### 1.4 Workspace definitions
- **Merchant Workspace** — the merchant's home. S0 shows the five essential nouns (Home, Products, Orders, Deals, one contextual); higher Surface Levels reveal Inventory, Shipping, Returns, Sparks, Marketing, Analytics, Settings. Scoped by business membership.
- **Admin Workspace** [roadmap] — platform operations: entitlement grants, capability registry, trust-level transitions, business standing actions, dispute oversight. Every action audited + step-up-gated. Strict isolation from merchant surfaces (separate scope, separate nav, no shared mutation paths).
- **Moderator Workspace** [roadmap] — Trust & Safety queue: flagged content/Sparks/comments, enforcement holds on stores, standing recommendations (not final standing changes — those are admin). Read-mostly with scoped enforcement actions.

---

## 2. Screen Inventory

Format per screen: Purpose · Actor · Entry → Exit · Permissions · Domain deps · Device notes.

### 2.1 Identity & Account [built]
- **Register** — create account · anon · landing/Ignite-claim → workspace · none · Identity · mobile-first single column.
- **Login** — authenticate · anon · nav/deep-link → intended route · none · Identity · passkey + password.
- **Verify Email** — confirm ownership · new merchant · email link → onboarding · session · Identity · four states (pending/verifying/done/failed) + resend.
- **Forgot / Reset** — recover access · anon · login → login · none · Identity · single-use token.
- **Account Settings** — profile, sessions, passkeys, security · merchant · settings → settings · self-service · Identity · list of active sessions, revoke-all.

### 2.2 Onboarding & Ignite [built]
- **Guided Onboarding** — discovery profile → recommendation · verified merchant · workspace/verify → Ignite · session · Onboarding(+Identity) · conversational, one question/screen, save-resume.
- **Ignite Journey** — turn an idea into a store · merchant/guest · onboarding/landing → store live · session or guest · Ignite/Commerce/Merchant · live preview, three-question core, the Mirror, the Reveal.
- **Ignite Import Door** — bring an existing store · merchant · Ignite → Ignite · session · Ignite/Commerce · connector picker.

### 2.3 Merchant Workspace core
- **Home** [built] — orient + next step + progress · merchant · login → any module · membership · Merchant/Onboarding/Pulse · Getting-Started timeline, quick actions, honest empty states.
- **Products** [built] — catalog management · merchant(role) · Home → product detail · `products.*` capability + role · Commerce · list/detail; media, variants, options.
- **Store** [built] — storefront config, brand kit, publish · merchant(role) · Home → live store · `stores.*` + publish gate · Merchant/Commerce · brand kit editor, publish button (standing/hold gated).
- **Inventory** [roadmap] — stock per location · merchant · Products/Home → detail · role · Operations/Commerce · location-aware.
- **Orders** [roadmap R1-B5] — needs-action-first fulfillment · merchant · Home → order detail · role · Orders/Commerce · money attached, mobile packing view.
- **Customers** [roadmap] · **Deals** [roadmap] · **Coupons** [roadmap] · **Marketing** [roadmap] · **Shipping** [roadmap] · **Returns** [roadmap] — each: merchant(role), domain-gated, empty-states-that-teach until data exists.
- **Sparks (Community)** [roadmap] — merchant↔buyer conversation/updates · merchant · Home → thread · role · Community/Content · calm, non-noisy.
- **Analytics (Pulse)** [roadmap] — business health as a sentence, then evidence · merchant · Home → insight · role · Pulse/AI/Search · "twice your usual Tuesday," never a wall of charts.
- **Settings** [built] — business, team, entitlements, domains · owner/admin role · Home → settings · role + step-up for sensitive · Merchant/Identity.

### 2.4 Public / Buyer [roadmap]
- **Storefront Home / Product / Cart / Checkout** — buy · shopper/guest · marketplace/link → order confirmation · public/guest · Commerce/Orders/Payments · fast, cache-first, guest-token checkout.
- **Marketplace Discovery / Search** — find · shopper · public → storefront · public · Search/Commerce · SSR + public-read.

### 2.5 Admin / Moderator [roadmap]
- **Admin: Entitlements, Capability Registry, Trust Transitions, Standing Actions, Disputes** — operate the platform · admin · console → console · admin scope + step-up · all domains (read) + Administration (write) · audited.
- **Moderator: Review Queue, Content Detail, Enforcement Hold** — protect the marketplace · moderator · console → resolved · moderator scope · Community/Content/Merchant(hold) · queue-driven.

---

## 3. User Journey Maps

### 3.1 Shopper [roadmap]
- **First use:** marketplace/link → browse (public) → add to cart → guest checkout (guest token) → order confirmation → optional account claim. *No forced signup before value.*
- **Returning:** login or guest-cookie → order history → re-order.
- **Advanced:** follow merchants (Sparks), saved carts, address book.

### 3.2 Merchant [built core]
- **First use:** register → verify email (never blocks selling) → guided onboarding (discovery) → Ignite (store in ~5 min) → Home shows "N steps to first sale" → add first product → publish.
- **Returning:** login → Home orients (needs-action, progress, opportunities) → work the one next thing.
- **Advanced:** raise Surface Level, invite staff (human/AI agents), configure entitlements, use Pulse proposals, multi-store, marketplace participation.

### 3.3 Creator [roadmap]
- A merchant whose product *is* content (courses, memberships, digital). First use routes onboarding → digital-first store config; advanced: Sparks as audience channel, membership tiers.

### 3.4 Brand [roadmap]
- Registered business, higher trust/scale tiers. First use: business verification → banking verification → wholesale/marketplace entitlements; advanced: multi-store, staff roles, brand-kit governance, analytics at scale.

### 3.5 Moderator [roadmap]
- First use: scoped console → review queue. Returning: triage flagged items → apply enforcement hold (orthogonal to store status) → recommend standing change. Advanced: bulk actions, policy templates, appeal handling.

### 3.6 Administrator [roadmap]
- First use: admin console → platform health. Returning: entitlement/standing actions (step-up + audited). Advanced: capability-registry evolution, trust-tier policy, dispute adjudication, incident response.

Every journey is designed so a first-time user needs **zero documentation** (Grandma Test) and a merchant reaches a sellable store in **five minutes** (Five-Minute Business).

---

## 4. Global Navigation Model

- **Primary nav** — the module rail (Home, Products, Orders, Deals, …), driven by the nav schema + capability/Surface-Level filtering. Desktop: left rail. Mobile: 5-slot bottom tab bar + "More" sheet (the S0 noun budget).
- **Secondary nav** — within-module sub-navigation (e.g., Product → detail/media/variants) via breadcrumbs + in-page tabs.
- **Contextual actions** — object-level actions surface on the object (publish on Store, fulfill on Order), never in a global menu.
- **Search / Ask Bar** — `⌘K` command palette (`DofAskBar`) is the universal accelerator: navigate, act, and (future) ask Pulse. Records recents.
- **Breadcrumbs** — reflect true location and navigate home; one line, never a maze (`DofBreadcrumbs`).
- **Keyboard shortcuts** — palette-first today; a future-ready registry maps verbs→keys per surface (documented, not yet bound).
- **Postures** — comfortable (desktop), compact (mobile bottom-bar). One layout, two postures — not two apps.

---

## 5. Component Inventory

Built components exist in the design system today; roadmap components are designed here. Each: responsibility · reuse.

- **Foundation** [built]: `DofText, DofIcon, DofButton, DofIconButton, DofSplitButton, DofCard, DofDivider, DofBadge, DofTag, DofChip, DofAvatar, DofStatus, DofTooltip, DofPopover, DofDropdown, DofContextMenu`. Tokens + primitives; reused everywhere.
- **Forms** [built]: `DofField, DofInput, DofEmailInput, DofPasswordInput, DofNumberInput, DofMoneyInput, DofSearchInput, DofTextarea, DofSelect, DofMultiSelect, DofCombobox, DofCheckbox, DofRadioGroup, DofSwitch`. Validated inputs; reused by every create/edit flow.
- **Navigation** [built]: `DofWorkspaceLayout, DofBreadcrumbs, DofAskBar`. Shell, wayfinding, command palette.
- **Layout** [built]: `DofFeedLayout, DofObjectLayout, DofCatalogLayout, DofSettingsLayout, DofRunShell`. Page skeletons per archetype.
- **Feedback** [built]: `DofProblem, DofEmptyState, DofLoadingState, DofSkeleton, DofSpinner, DofProgress, DofToastRegion, DofUndoToast, DofAnnouncer`. Honest states, calm notifications, a11y live regions.
- **Data Display** [built]: `DofMoney, DofTime`. Canonical formatting (bigint minor units; timezone-aware).
- **AI** [built]: `DofProposalCard, DofConfidence`. Pulse/Ignite proposals with evidence + confidence, never raw model output.
- **Commerce** [roadmap]: ProductCard, VariantMatrix, PriceEditor, CartLine, CheckoutSummary, InventoryBadge. Buyer + merchant catalog surfaces.
- **Community** [roadmap]: SparkCard, CommentThread, ReactionBar, FollowButton. Calm merchant↔buyer conversation.
- **Merchant** [roadmap]: StoreCard, BrandKitEditor, StorefrontPreview, TeamMemberRow, EntitlementRow. Business/store management.
- **Content** [roadmap]: MediaUploader, MediaGallery, RichText, SeoEditor. Reusable across product/store/sparks.
- **Admin** [roadmap]: ReviewQueueRow, AuditTrailView, StandingBadge, CapabilityMatrix, EnforcementControls. Operate the platform.

Rule: a component is promoted to the design system only when reused across ≥2 domains; domain-specific composites stay in the domain until then.

---

## 6. Platform State Machines

Coded machines are authoritative; roadmap machines follow the same text+CHECK, explicit-transition discipline (ADR-004). **Status and enforcement are orthogonal** — a Trust & Safety hold never overwrites a merchant's status.

- **Merchant account** [built]: `active → deactivated`.
- **Business** [built]: standing `good → flagged → restricted → suspended → banned` (plus recovery paths); trust `unverified → identity_verified → business_verified → banking_verified`; scale `starter → growth → established → enterprise`; lifecycle `active → closed` (L2 forbids closing with stock).
- **Store** [built]: status `draft → live → paused → archived → closed → deleted`; **enforcement_hold** `none → under_review → suspended` (orthogonal, moderator-owned).
- **Store handle** [built]: `reserved → active → redirect → quarantined`.
- **Staff membership** [built]: `invited → active → suspended → revoked`.
- **Onboarding profile** [built]: `in_progress → completed` (editable after).
- **Product** [built, commerce]: `draft → active → archived` (+ readiness gate to publish).
- **Outbox event** [built]: `pending → dispatched | dead`.
- **Listing / Deal / Coupon / Spark / Comment / Verification / Notification / Media** [roadmap]:
  - Listing: `draft → active → paused → ended`.
  - Deal: `scheduled → running → ended | cancelled`.
  - Coupon: `active → exhausted | expired | revoked`.
  - Spark: `draft → published → archived | removed(moderation)`.
  - Comment: `visible → hidden(moderation) → removed`.
  - Verification: `unsubmitted → pending → verified | rejected`.
  - Notification: `queued → sent → read | dismissed | dead`.
  - Media: `uploading → processing → ready | failed | quarantined`.

Each transition: explicit command, gated, audited, and (where a fact changes) an emitted domain event via the transactional outbox.

---

## 7. Cross-Domain Interaction Matrix

Interaction is **event-driven and one-directional** — no domain reads another's tables, no synchronous cross-domain calls that create cycles (ADR-003/004). Rows emit; columns react via the outbox.

| Emits ↓ / Reacts → | Merchant | Commerce | Community | Content | AI (Ignite/Pulse) | Search | Notifications | Administration |
|---|---|---|---|---|---|---|---|---|
| **Merchant** | — | store.published→listable | store→sparks channel | brand-kit assets | signals | index store | staff invites | standing/entitlement |
| **Commerce** | stock↔store readiness | — | product→spark topic | product media | catalog signals | index products | order events | dispute inputs |
| **Community** | — | — | — | comment content | sentiment signals | index sparks | reply notices | moderation queue |
| **Content/Media** | brand assets | product media | spark media | — | asset analysis | media index | — | quarantine |
| **AI** | proposals | proposals | draft suggestions | draft copy | — | ranking hints | proposal notices | anomaly flags |
| **Search** | — | — | — | — | — | — | — | — (read model) |
| **Notifications** | — | — | — | — | — | — | — | delivery audit |
| **Administration** | standing/entitlement→all | — | enforcement→hold | quarantine | policy | — | broadcasts | — |

Cycle prevention: dependencies point **toward the kernel and toward read-models**; Search/Notifications/Pulse are **consumers** (read-models), never sources of truth. Administration acts *on* domains via commands + events, and reads via projections — never the reverse edge.

---

## 8. Experience Principles Applied

- **Grandma Test** — every first-run screen teaches by doing: honest empty states ("Orders land here… a to-do list with money attached"), one visible next step, no jargon. Onboarding is a conversation, not a form.
- **Five-Minute Business** — Ignite compresses idea→sellable store to ~5 minutes; verification/onboarding never block selling; the Home timeline always names *one* next action.
- **Progressive Complexity** — Surface Levels (S0…S3) reveal capability as trust/scale grow; the S0 five-noun budget keeps the first experience calm; entitlements + capability registry unlock features by readiness, not by dumping settings.
- **Invisible Complexity** — the triple gate, outbox, audit, and immutability are enforced platform-side; merchants never see "configure your event bus." Money is bigint minor units under the hood, `DofMoney` on screen.
- **Opportunity First** — Pulse/opportunity panels surface *real* signals ("142 views, no deal running"), never manufactured urgency; the next step is always framed as an opportunity, not a chore.
- **Calm by default** — notifications are quiet until useful; AI is proposals-with-evidence (`DofProposalCard` + `DofConfidence`), never autonomous noise.

---

## 9. Future Expansion Strategy

Extension points, each already compatible with the built foundation:

- **Browser extension / Mobile apps** — the workspace is one API + one design system in postures; a token-authenticated client reuses both. Session model already supports opaque-token auth and remember-me.
- **Public APIs** — contract-first (zod + OpenAPI in `contracts/`), RFC 9457 errors, Idempotency-Key, keyset pagination, correlation IDs are already the internal standard → externalizing is versioning + auth-scoping, not redesign.
- **Marketplace** — store.published events already feed a listable read-model; Search is a consumer projection; standing/trust gates marketplace eligibility.
- **Internationalization / Multi-language** — i18n catalog exists; content VOs (`Locale`, `Language`, `SeoMetadata`) added on first use (SHARED_KERNEL R4); all copy is externalized.
- **Multi-currency** — money is bigint minor units + explicit `Currency`; storefront/display already isolate formatting (`DofMoney`).
- **AI agents** — `staff_memberships` already models `ai_agent` principals with `ai_policy`; the command gate treats agents as first-class scoped actors; proposals flow through the same audited command path.
- **Third-party integrations** — Ignite import adapters + the outbox/consumer registry provide the inbound/outbound seam; capability entitlements gate integration access.
- **Domain extraction** — per-domain quartet + no cross-domain FKs + framework-free kernel (`shared/`+`platform/`) mean any domain can become an independent service without schema rewrite.

---

## Definition of authority
DPS-001 is the reference every subsequent spec/ADR/blueprint must conform to. Where a future document conflicts with DPS-001, DPS-001 governs the *platform shape*; the conflicting document must be amended or its deviation explicitly justified. This spec adds no code, API, or schema — it defines *what* the platform is so implementation can proceed coherently.
