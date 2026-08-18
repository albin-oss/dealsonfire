# C12-3 CERTIFICATION — A Person, and a Proven Recovery

**Increment:** C12-3 (Launch Foundations, final increment) · **Branch:** `increment/c12-3-person` · **Date:** 2026-08-18
**Verdict:** **GO — unconditional** (evidence classes below; nothing conflated)

A stranger who bought a blanket can now safely become a person: create an account, prove the inbox, come back from a lost password, move the account to a new address without handing it to an attacker, and see exactly what DOF holds. And the platform can prove — not hope — that a backup restores.

Evidence classes, used exactly: **[AUTOMATED]** (test suite) · **[BROWSER]** (walked in the real app) · **[DRILL]** (actual restore executed) · **[EXTERNAL]** (outside provider observed) · **[NOT DEMONSTRATED]** (honestly absent).

---

## Phase 0 — Principal-Engineer hostile review (classification verdict)

- **KEEP:** `email_changes` state machine (one authoritative table; states pending/completed/reverted/superseded; partial-unique one-pending-per-user), `consent_facts` (append-only), the four token purposes on the EXISTING `user_recovery_tokens`, the legal registry in code, the drill script with guardrails-as-code.
- **REUSE (no new machinery):** dormant `guest_tokens` for order keys (scope `'order'`, hashed, 30-day) — the C12-2 readiness decision honored; identity primitives (sessions, step-up, recovery tokens) unchanged; letters ride the C12-1 mail journal; rate limits ride C12-2 durable buckets.
- **REMOVED:** nothing. **Founder-blocking findings:** none — the review was minimal, work continued immediately as directed.

## 1. The scanner-safety law — GET MUST NOT CONSUME A SECURITY TOKEN

The C12-1 external finding (live.com SafeLinks completed a verification by fetching the letter's link) is closed as a LAW, not a patch:

- `/verify`, `/confirm-email-change`, `/undo-email-change` render the token into page state and an explicit button; only a human press POSTs the token. `/reset` was already form-shaped. **[BROWSER]** — a GET of `/verify?token=…` fired **zero** token-consuming requests (network log inspected); the page says "Nothing happens until you press it."
- One-shot semantics **[AUTOMATED]**: replay-after-success 400 · malformed 400 · expired 400 · cross-purpose (reset token at verify door) 400 · two concurrent confirmations → exactly one 200.

## 2. The email-change law (the account-takeover surface)

One authoritative state machine; hostile matrix **[AUTOMATED]**, full journey **[BROWSER]**:

| Scenario | Result |
|---|---|
| Password-holder with stale step-up (>5 min) asks to move | **403** — refused before any letter |
| Honest move | new inbox gets possession proof · old inbox gets notice with **masked** target (`n···@…`) · completion applies email, revokes **every** session, opens 72-h revert |
| Attacker completes move, then changes the password via recovery to the new address | old inbox's revert **still wins**: email restored, all sessions dead, ALL outstanding token purposes invalidated (the attacker's world is gone) — **[AUTOMATED]** and **[BROWSER]** end-to-end |
| Revert after 72 h | uniform 400 (window honestly closed) |
| Target address already on another account | requester sees the SAME 200; the truth goes to the ADDRESS ("already on a DOF account" letter); nothing pending; victim untouched — enumeration-proof |
| Two changes race | second **supersedes** first; first token dies; second completes |
| Replay of either token | 400 |

Browser journey walked in **session identity mode** (`scripts/dev-session.ts` — the production auth path: cookies, CSRF origin assertion): register → verify (explicit press) → `/account` → move → signed out everywhere (observed) → undo from old inbox → home again → recover password → sign in fresh → `/account` shows 1 session, no pending change.

## 3. Guest order keys

Confirmation letters now carry `?key=` minted from dormant `guest_tokens` in the same tx as the letter. **[BROWSER]**: the key link opened order #7 in a browser that never held the buyer's cookie ("any device" is literal). **[AUTOMATED]**: wrong key, foreign order, missing key, expired key → the same masked 404; replay reads fine (read-only is the point); no account minted; a signed-in stranger with the link sees the order and gains nothing else. The walk used a REAL Stripe test-mode payment (PaymentIntent confirmed with the canonical test card, converged through `checkout/complete`) **[EXTERNAL]**.

## 4. Consent as facts

Registration writes append-only `consent_facts` (terms accepted, privacy acknowledged; version `0-draft-placeholder`; no raw IP, no analytics). Derivation = latest fact per document **[AUTOMATED]**: a later `withdrawn` fact changes the derived state while both rows remain. `/account` lists agreements **[BROWSER]**.

## 5. Legal placeholders

`/legal/{terms,privacy,returns,impressum}` exist, each bannered **"PLACEHOLDER — NOT APPROVED FOR PUBLIC LAUNCH"** **[BROWSER]**. No legal wording was invented; the registry lives in code (`contracts/legal/documents.ts`), not a CMS. Counsel-approved text is a PUBLIC-LAUNCH-GATE (PRODUCTION_CUTOVER §4).

## 6. The restore drill **[DRILL]**

`scripts/restore-drill.mjs` — an ACTUAL `pg_dump` → restore into an isolated `dof_drill` database. Guardrails as code: loopback-only hosts, explicit env aiming, target name must end `_drill` (the drop refuses anything else).

- **First run FAILED honestly** — the drill caught real schema drift (dev world missing migration 0030). That failure is the drill doing its job.
- After migrating: **PASSED — 0.7 s wall clock** (dump 0.1 s + restore 0.4 s at 1,155 rows / 167 physical tables). On the RESTORED copy: table & row parity exact · **L1** every posting balances · **L3** cached ≡ recomputed balances · users/credentials intact, no orphans · `guest_tokens`/`consent_facts`/`email_changes`/`mail_journal`/`user_recovery_tokens` present · representative order read joins (orders ⋈ stores ⋈ lines).
- **[NOT DEMONSTRATED]**, recorded in the drill's own output: restore onto a different host; media files (outside pg_dump); PITR/WAL; production-scale duration; app boot against the restored copy.

## 7. Production cutover

`architecture/PRODUCTION_CUTOVER.md` now carries every gate in five classes (PROVEN / CONFIGURED-NOT-PROVEN / FOUNDER-COUNSEL / DEPLOYMENT / PUBLIC-LAUNCH-GATE), consolidating C10/C11 money, C12-1 mail, C12-2 security, C12-3 person+recovery. The public-launch gate list is in one place (§6 there).

## 8. Experience review (street language)

The journey reads like a person talking: "that's your safety net" · "Nothing happens until you press it" · "including anyone who shouldn't have been there" · "this link is yours — it works on any device." No token/step-up jargon on any screen. Observations recorded, none blocking:

- A fresh buyer lands on the merchant-leaning workspace ("Create your store") — deliberate ("one account grows with you") but the street may deserve a buyer-first landing when Living Street arrives.
- The old-address notice masks the new address (`n···@…`) — even a compromised old inbox learns nothing extra. Kept.

## 9. Security hostile review

Attack surface walked as an attacker: enumeration (uniform answers, truth to the address), token replay/cross-purpose/concurrency (one-shot proven), step-up freshness (403 pinned), session fixation after email change (all sessions die), the revert-vs-password-change race (revert wins by design — possession of the OLD inbox is the root of trust for 72 h), guest-key scope confinement (one order, nothing else), CSRF (origin assertion armed in session mode; SameSite=Lax primary), rate limits on every new public door (request 5/h; confirm/revert 10/5 min). **No HIGH or CRITICAL findings open.**

## 10. Full sweep

Recorded at release time in the PR: one clean run, dev server stopped, honest exit codes (`EXIT=$?` captured, no pipe masking). Two real defects found by the C12-3 suites before the candidate (missing imports in `register.post.ts` — every registration 500'd; `deleted_at` column that never existed — the email-change service now checks `status='active'`): both fixed as truths, neither reclassified.

---

**GO.** Scope complete, laws upheld (§7 boundary untouched, rollback law, mail semantics, webhook invariant, enforcement_hold semantics, scanner-safety law now binding), no borrowed scope from Living Street.
