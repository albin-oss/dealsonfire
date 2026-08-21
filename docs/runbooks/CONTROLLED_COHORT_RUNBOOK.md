# CONTROLLED COHORT RUNBOOK — the first strangers

**Status:** operational · prepared during LS-2/LS-3 (2026-08-20) · authorized by the C12 retrospective's cohort GO
**What this is:** a pilot with 10–20 invited strangers. NOT a launch. NOT public. NOT real money.

## Readiness

| Precondition | State |
|---|---|
| Platform safety (accounts, recovery, mail, locks, abuse loop, restore) | **READY** — certified through C12, extended by LS-1/LS-2 |
| Sender domain verified in Resend (letters to arbitrary inboxes) | **NOT DONE — the one blocking human action.** The current test sender delivers only to the owner's inbox; cohort invitees will not receive letters until a domain is verified (Founder chooses the domain, adds Resend's DNS records, ~15 min + propagation) |
| Founder pilot framing ("pilot, no claims" invitation wording) | **NOT DONE — Founder writes or approves the invitation text.** Legal pages are bannered placeholders; the framing must say so |
| Operator on the abuse alarm during cohort hours | Founder assigns (can be the Founder) |
| Test-mode commerce only | Already true everywhere; no action |

**Verdict: READY TO INVITE once the two human actions above are done.** Nothing engineering-side remains.

## The cohort

- 10–20 people who have never seen DOF; mix of "would buy handmade" and indifferent.
- Invited personally by the Founder with the approved pilot framing; no public links, no social posts.
- Each gets: the URL, "you can create an account or not — both are interesting", and no other instructions.

## What we ask them to do

1. Arrive at the street. Say (verbatim capture) what they think this place is.
2. Find something they'd actually want. Any road: search, wander, shops.
3. Follow anything worth following; save anything worth saving.
4. Try to buy one thing (test card 4242…; say clearly it's a pilot, not a charge).
5. Come back two days later without a reminder link and find their order and their followed shops again.

## What we observe (all already recorded by the platform)

- Search vocabulary and missing words — `attention_facts` via `npm run learning` (LS1b/c, LS2a/b)
- What they stop for vs what they were shown — LS1a; the doors they use — LS1d
- Follows/saves/fires — engagement facts; return visits — corner + session facts
- Confusion — the observer writes down VERBATIM what the person says when stuck; no paraphrasing, no leading

## What we explicitly do NOT do

- No coaching past the first sentence ("it's a street of independent shops" is all we may say when asked "what is this?")
- No steering to search or to any shop; no explaining Sparks — whether strangers understand them unprompted is a finding
- No recording beyond what the platform already records + the observer's verbatim notes; no screen recording, no session replay
- No fabricated findings: if a session produces nothing, that is the finding

## Stop conditions (any one stops the cohort immediately)

- The abuse door fires on cohort traffic the operator cannot triage in real time
- A stranger reaches money that is not test-mode
- A HIGH/CRITICAL security or privacy finding
- A held/masked surface becomes visible to any cohort member
- Mail stops delivering (journal alarms) — identity flows without letters strand people

## After

Findings (verbatim confusion + learning-ledger readouts) go into a short COHORT_FINDINGS.md; Phase 2's remaining increments are reordered against it. Real cohort data outranks every internal judgment in this program.
