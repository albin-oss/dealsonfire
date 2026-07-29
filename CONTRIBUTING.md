# Contributing to DOF — the golden path

You inherited this codebase, or you just joined. This file is the two-week
onboarding compressed: the laws the machines enforce, the laws only this file
enforces, and the three commands that keep both. (Why this file exists:
LONG_TERM_MAINTAINABILITY_REVIEW — every item here once lived only in
someone's memory, and each burned that someone at least once.)

## Day one

1. Read, in order: `architecture/README.md` (the map — tells you what's frozen),
   ADR-001..008 executive summaries, `VISIBILITY_CONTRACT.md`, `UI_IMPLEMENTATION_CONTRACT.md`.
2. `npm run dev:demo` — a seeded world on http://localhost:3000. Rosa Knits is
   user `11111111-1111-4111-8111-111111111111`; the workspace picks identity from
   localStorage `dof.dev-user-id` (dev only). Personas live in `scripts/dev-demo.ts`.
3. Walk one merged increment PR end to end (pick any `Commerce Foundation C*`).

## The three commands

- **`npm run sweep`** — the FULL verification gate in the correct order (build
  first: the e2e app project serves `.output`). Run it in a SEPARATE command
  before you commit; never chain sweep && commit (a hidden failure once merged
  that way). If you grep its output, grep for `failed` AND `passed` — Playwright
  prints failures ABOVE the pass count.
- **`node scripts/release.mjs --title "..." --tag vX.Y.Z`** — PR + merge + tag,
  with the one law the old ritual twice violated: no verified merge, no tag.
- **`npm run learning`** — the evidence ledger (founder review inputs).

## Platform laws you cannot discover by reading one file

- **`withTransaction` ROLLS BACK `{ok:false}`-shaped returns** (platform/db.ts).
  Deliberate: commands that return errors leave no partial writes. Consequence:
  if your "failure" outcome must PERSIST (a resolved cancellation, a recorded
  decline), return `ok:true` with a state field — see
  `domains/orders/checkout/application/confirm.ts` for the canonical example.
  This law bit the original team three times. It will try to bite you.
- **Domains never import each other.** Cross-domain calls are composed in
  `server/utils/container.ts` via structural typing (implement the port shape
  without importing it). `check:boundaries` enforces the imports; this note
  explains the pattern you'll see.
- **Composition-root reads are not a boundary violation.** `server/utils/deals-feed.ts`
  and `momentum.ts` deliberately join across domain tables at the root — they are
  read-model composition, owned by the composition root. Do not "fix" them into a
  domain; you would be creating the coupling they exist to avoid.
- **Cross-domain ids are BY VALUE — never foreign keys.** A cart line FK into
  `product_variants` once blocked merchants' catalog operations; the data gate
  now watches, but understand why: another domain's rows must never veto this
  domain's writes.
- **Integration tests mount handlers by hand** (`tests/helpers/app.ts`, D-12:
  the REAL handlers over real HTTP). A bare 404 in an integration test almost
  always means you forgot to register your new endpoint there.
- **Append-only means grant-enforced.** Events, audit logs, ledgers, timelines:
  the app role cannot UPDATE/DELETE them (db/grants). Corrections are reversing
  entries, never edits.
- **New tables need three registrations**: the migration, `contracts/data/manifest.json`
  (owner/PII/retention — and retention promises must have purge jobs), and — if
  append-only — `db/grants/immutable-tables.sql`. `check:data` refuses otherwise.
- **New domain events need payload schemas** in `contracts/schemas/events/*-payloads.ts`,
  wired into the domain's dispatcher (M-6: register with the sprint that first emits).

## Language laws (lint-level, but learn them)

Merchant-side: shelf, bench, parcel, promise, people — never inventory, SKU,
pipeline, dashboard. Buyer-side: maker, shop, promise, "on its way to being
yours" — never vendor, ETA, "your package". Counts with visible denominators;
money always via DofMoney in integer minor units; time always via DofTime.

## When something is weird

`docs/runbooks/order-reconstruction.md` reconstructs any order in three queries.
The alarms (logger component `orders-confirm`) name their own manual steps.
Migration checksums are enforced — never edit an applied migration; write a new
one (dev DBs in `.data/` are disposable: delete and reboot).
