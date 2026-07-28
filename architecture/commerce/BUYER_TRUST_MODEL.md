# DOF Buyer Experience — BUYER_TRUST_MODEL

**Status:** For Founder approval (design only; architecture frozen) · v1.0 · 2026-07-27
**Law inherited:** every trust signal derives from a real recorded event; no badges, no scores, no gamification, no fabricated activity; chronological, never ranked.

---

## 1. The five fears (in the order they kill purchases)

A first-time visitor on an unknown maker's product page runs five questions, mostly pre-verbally:

| # | Fear | The question under it | Kills the purchase when |
|---|---|---|---|
| F1 | **Existence** | "Is this a real person, or a page someone generated?" | anything feels templated, dead, or too clean |
| F2 | **Delivery** | "Will anything actually arrive?" | no evidence anyone has ever received anything |
| F3 | **Accuracy** | "Will it be what the photos show?" | photos are generic; words are catalog-speak |
| F4 | **Recourse** | "If it goes wrong, am I stranded?" | policy is absent, vague, or buried |
| F5 | **Value** | "Is this price fair?" | rarely alone — usually F3 wearing a price tag |

Everything in this model is judged by one test: **which fear does this signal reduce, and could a bad actor fake it cheaply?**

## 2. The evidence ladder (signals ranked by forgery cost)

**Class 1 — Platform-witnessed outcomes** (unfakeable; DOF recorded the event itself):
promise-kept counts (shipped by the promised date), delivery confirmations, refund speed when things went wrong, repeat buyers, dispute outcomes. *These arrive with C5+ (orders) and are the endgame.* Presentation law: **counts, never percentages** — "41 of 43 orders arrived on time, 2 arrived late" reads as evidence; "95.3%" reads as marketing. And the denominator is never hidden.

**Class 2 — Sustained liveness** (expensive to fake because it costs *time*): spark cadence across months, follower growth, fires from distinct visitors, deals run and honored, the opened-date. A scammer can write one good story tonight; they cannot backfill four months of Tuesday-morning roast updates. *All of this exists today.*

**Class 3 — Voice** (cheap to fake once, expensive to fake well): the story, the promise, behind-the-scenes photos, the specific way a knitter talks about dye lots. Buyers are excellent forgery detectors at this layer — the design's job is to *surface* voice, not vouch for it. *Exists today.*

**Class 4 — Rejected forms:** star ratings (compressed, gameable, an arms race Etsy already lost), badges ("Trusted Seller" is an assertion, not evidence), AI trust scores (asks the buyer to trust our model instead of the merchant), review text as primary signal (fake-review economics are unwinnable; DOF's substitute is Class 1 outcomes + Class 2 liveness, which cannot be purchased in bulk).

## 3. The structural signal nobody else has

The approved payment policy (PAYMENT_POLICY_DECISION.md) gives DOF a sentence Shopify stores, Etsy shops, and most marketplaces cannot say plainly:

> **"The maker isn't paid until your order ships. If it doesn't ship, your refund is automatic."**

This is not copy — it is the literal mechanics of the payout hold and the no-ship aging path. F2 and F4, the two purchase-killing fears a *new* shop cannot answer with history, are answered **by the platform's money design** on day zero. This sentence (in its exact, legally reviewed final form) is the keystone of the confidence system and appears at the decision point of every product page.

## 4. The cold-start answer (honest newness)

A shop with no orders has no Class 1 evidence, and the model refuses to fake any. Instead:
- **Newness is stated, not hidden**: "Opened this March" — buyers forgive youth; they punish pretense.
- Class 2/3 carry the load: the latest spark with its timestamp, the story, the promise line.
- The keystone sentence carries F2/F4 completely — that is *why* the payout hold exists.
- **Thresholded reveal**: outcome counts appear only when they help (≥3 completed orders); sparse evidence is worse than none ("1 of 1 orders on time" invites doubt). Below threshold, the space belongs to the platform promise.

## 5. Signals evaluated (the challenge table)

| Candidate | Verdict | Reason |
|---|---|---|
| Promise-kept counts | **KEEP** (C5+) | Class 1; the hardest number in commerce; already in the trust-record projection plan (AMENDMENT-001 rec.) |
| Average shipping delay | **REFRAME** | raw averages mislead at small n; becomes "usually ships in N–M days" derived from actual case history, shown only at ≥5 shipments |
| Typical response time | **DEFER** | no messaging capability exists; do not imply responsiveness we can't measure — arrives with buyer questions, if ever |
| Repeat buyers | **KEEP** (C5+) | Class 1 and emotionally decisive ("people come back") — count shown at ≥2 |
| Followers / repeat followers | **KEEP** (today) | Class 2; already public ("N people follow this store") |
| Merchant activity / recent sparks | **KEEP** (today) | THE liveness signal; timestamped, on product pages, not just the storefront |
| Behind-the-scenes / production / packaging photos | **KEEP as practice, not feature** | sparks already carry photos; the playbook (not the platform) teaches makers this habit — no new capability |
| Order-preparation progress | **DEFER to C6** | real once fulfillment cases exist; buyer timeline shows true case states, never theater |
| Buyer questions & merchant answers | **SEAM, gated** | genuinely strong (F3), but a new business capability (public Q&A) — designed as a seam in BUYER_CONFIDENCE_SYSTEM §6, requires Founder gate + street evidence before building |
| Return fairness / refund history | **KEEP** (C8/C9+) | "when things went wrong, they made it right in a median of 2 days" — Class 1 gold; counts + medians, thresholded |
| Community interactions | **REJECT** | vague; fires/follows already carry it without a new surface |
| Handmade evidence | **REJECT as signal category** | unverifiable claim; the *voice* layer carries it where true |
| Merchant story / promise | **KEEP** (today) | Class 3 keystones, already built (Release 0.5) — now placed where the deciding happens |

## 6. One-line model

**Show the buyer a person who is present today (Class 2/3), the platform's money design that protects them regardless (keystone), and — as soon as they exist — the uncompressed outcomes of every promise this shop ever made (Class 1). Never summarize; never assert; always show the receipt.**
