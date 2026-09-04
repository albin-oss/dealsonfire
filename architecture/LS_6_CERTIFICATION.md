# LS-6 CERTIFICATION — The Street Remembers

**Increment:** LS-6 (Living Street) · **Branch:** `increment/ls-6-return` · **Date:** 2026-09-04
**Verdict:** **GO — unconditional** (sweep recorded at merge)

## §0 gate
LS-5 reached unconditional GO and released as v1.52.0 (tag ≡ merge `1c04404` ≡ origin/main, clean tree) — verified before LS-6 began. Evidence classes at authorization: **[REAL COHORT] none** (still awaiting the two Founder actions), **[FOUNDER WALK]** the LS-8 onboarding walkthrough, **[DEMO/SEEDED]** the eight-shop world, **[AUTOMATED]** the suites. Unmerged.

## Was RETURN actually the bottleneck?
The LS-5 report scored FIND/UNDERSTAND/WANDER/SHARE served and RETURN weakest: nothing gave a stranger a reason to come back. Confirmed structurally — follows existed but created no future utility; a returning visitor had no honest "what changed?" surface. So RETURN is the right next engineering step. (Content volume remains the standing bottleneck, but it is a Founder/cohort action, not an increment.)

## Product law honored
No streaks, rewards, red dots, urgency, FOMO, reminder spam, engagement scoring, or push infrastructure. The return experience is a pure read over authoritative facts (follows + publication time + the existing watermark) and only ever reports things that genuinely happened. Return is downstream of real marketplace change — never a mechanism whose goal is to pull the user back.

## Return product model
`server/utils/return-journey.ts` → `GET /api/v1/public/since`. "New to me" = published after the visitor's last-session watermark, from a shop they FOLLOW, still visible under the enforcement law. Grouped: **voices** (sparks — the maker's voice leads, DOF's strongest legitimate reason to return), **things** (new products, photo-gated exactly like the feed), **deals** that started. Empty groups omitted; an all-empty return has `has_changes:false` and the client falls through to the Street.

## Last-visit / watermark law (§13)
New read-only accessor `readLastVisit()` — the return journey derives from the watermark but NEVER writes it, so a refresh or a second tab cannot erase the visitor's own "since you were here" state. Only the Home stream's `observeHomeVisit()` advances the watermark, once per 30-minute session. Proven: a `/since` read emits no `set-cookie`; a refresh shows the same changes ([AUTOMATED]).

## Identity / device semantics
Watermark and follows both ride the existing pseudonymous visitor cookie (device-local by design — stated honestly, no new sync infra). A claimed/signed-in account inherits the visitor's follows through the existing identity-claim path. No new identifier, no cross-device watermark sync (recorded as an honest limitation, not a bug).

## Follow → future value
Following now has a payoff: the return journey prioritizes changes from shops the visitor *deliberately* followed — the explicit relationship used explicitly, never silently turned into a ranking profile. Storefront copy makes the promise truthful and email-free: "Follow to see what's new here when you come back."

## Buyer-first landing
The C12-3 smell is fixed with an explicit fact, not a persona guess: a signed-in account that owns **no business** enters the Street (`/home`); anyone with a business (even a draft) is demonstrably a merchant and keeps the workspace. A "Sell on DOF" door on Home keeps onboarding one click away, so a would-be seller who lands on the Street is never stranded.

## "Since you were here" experience
A restrained "While you were away" section at the top of Home (filter=all only, and only when `has_changes`): a one-line honest summary ("2 new updates · 1 new thing from a shop you follow"), then the maker's voice as quoted sparks, then new things, then deals. Street language, no dashboard, no counters-as-badges, no notification rows.

## Sparks in the return loop
By design the voice leads: products change occasionally, a maker's voice changes often, and a new Spark from a followed maker is the single strongest honest reason to return. The section renders voices first and always.

## Empty / cold start (§25/§26)
No follows, or no prior visit → `has_changes:false`, no section rendered — the Street simply carries on. Browser-confirmed: a fresh visitor's Home shows no "While you were away" shell. Nothing fabricated, no "Nothing happened" copy.

## Email decision — **DEFERRED** (not shipped, not refused)
Discovery mail is a distinct consent category from transactional identity/commerce mail. No discovery-mail opt-in mechanism exists, and the legal documents are NOT-APPROVED placeholders (C12-3). Per §19, consent is not invented and the letter stays disabled until Founder/counsel policy supplies cadence + opt-in wording. The on-site return journey ships fully without it. When enabled, the letter MUST ride the C12 mail journal (no second sender, §7 boundary, existing bounce/suppression, cutover gates) and be a WEEKLY aggregate gated on a meaningful-activity threshold — none of which is built yet, precisely because consent isn't.

## Visibility / enforcement
The `LIVE` conjunction is repeated in every return query. Hostile-proven: held/unpublished content is absent, including a hold that lands AFTER publication (the followed shop goes dark and its changes vanish from the return surface). No parallel enforcement copy.

## Privacy
No new identifiers, cookies (beyond reading the existing watermark), fingerprints, IPs, trackers, or profiles; no attention-retention change. The journey derives from EXPLICIT RELATIONSHIP + TIME + PUBLIC CONTENT — enough.

## Performance
Three bounded parallel queries (voices/things/deals), each an indexed followed-shop join limited to 6, plus one watermark cookie read. No projection, no N+1. Watch-trigger only if follow-graph size makes the EXISTS joins costly.

## Accessibility
The section is a labelled region with a real heading; new content is conveyed by text, not color; cards are focus-ringed links; the read never advances state, so focus can't jump under the visitor. Reduced-motion respected (no motion added). axe suites green in the sweep.

## Hostile results ([AUTOMATED], 6/6)
Watermark-since law · read never advances (refresh-safe, no set-cookie) · ancient content is never new / resurfacing ≠ newness · unfollowed shop never appears · held content absent incl. late holds · cold-start honest-empty.

## Browser demo
[BROWSER] fresh-visitor Home shows the honest empty return (no shell) and the buyer-first Street. [API] the populated moment proven end-to-end against real dev data: after following Rosa and publishing a fresh spark, `/since` returned `has_changes:true` with the maker's voice leading and truthful counts. The populated in-browser render requires aging an httpOnly watermark (correctly not settable from page JS); it is covered by [API] + the [AUTOMATED] suite rather than a staged screenshot — classified honestly rather than faked.

## The final product question
*Someone found a maker they liked Monday; they return Friday without searching. Do they feel following mattered?* Yes — the maker's new words meet them at the top of the Street, named, before anything else. And the harder question — *is DOF giving them a reason to return, or building mechanisms that ask them to?* — the return surface shows only genuine change and disappears when there is none; it never asks, it only reports. That is a reason, not a mechanism.

## Weakest of FIND / UNDERSTAND / WANDER / SHARE / RETURN
All five now have honest on-site support. The weakest is no longer a missing surface but **missing reality** — without real makers publishing and real people following, every surface is exercised only by seed data. The next constraint is inhabitants, which only the cohort provides.

**STOP after release** — LS-7 is not begun; it is a recommendation pending evidence that buyers generate demand merchants can't yet read.
