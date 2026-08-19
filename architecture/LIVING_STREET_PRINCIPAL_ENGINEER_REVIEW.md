# LIVING STREET — PRINCIPAL ENGINEER REVIEW (minimum-complexity, hostile)

**Reviewed:** `LIVING_STREET_PROGRAM_PLAN.md` · 2026-08-18 · verdict at the end.

## Challenges raised and dispositions

**"Is telemetry really the first increment, or is it invisible infrastructure?"**
Checked against the audit: LS-2 (search) is the biggest buyer pain, and it *could* ship first on invented vocabulary. But its relevance work would then be guesses, and the plan would re-open search in LS-6 anyway. LS-1 carries two visible surfaces (zero-result moment, merchant demand sentence) and unblocks every later increment's honesty. **Ordering stands** — with the condition that LS-1 stays SMALL (one table, one endpoint, one composable; a week-scale increment, not a platform).

**"One table or an event pipeline?"**
One table. The outbox quartets exist for DOMAIN events with delivery semantics; attention is high-volume, low-value-per-row, delete-after-90-days data with no consumers needing delivery guarantees. Routing it through an outbox would add dispatch cost and dead-letter noise for nothing. `attention_facts` is manifest class `operational`, not `event`. **Simplification accepted.**

**"Does the beacon need its own endpoint or can views be recorded server-side in existing GETs?"**
Server-side recording undercounts (storefront pages are shared-cache SSR) and couples read paths to writes. The engagement snapshots are already fetched client-side per view, so a client beacon matches the app's existing shape. One batch endpoint, sendBeacon-compatible. **Endpoint justified.**

**"Won't impressions explode row counts?"**
Bounded: batch cap (25/flush), client-side dedup per card per page-load, 120/min rate limit per IP, 90-day retention sweep in the existing cron loop, and consumers aggregate by DISTINCT visitor. At cohort scale this is thousands of rows/day; the indexes are three btrees. Revisit ONLY if p95 on the beacon or the sweep shows strain (a named watch-trigger, not a pre-built partition scheme). **No partitioning now.**

**"Fabricated subjects — an attacker inflating their own shop's demand?"**
Real risk to LS-7 receipts. Mitigations bound it: per-batch existence validation (one query per entity type per batch), DISTINCT-visitor aggregation (one attacker = one person), anonymous events reported as "glances" and never as "people", and rate limits. Receipts stay honest to the same degree follower counts already are. **Accepted with these mitigations mandatory.**

**"Does recording searches violate the no-tracking law?"**
The law is: no persistence of *visits* tied to identity by default, no raw IPs, no minting on passive acts. LS-1 keeps all three: the beacon NEVER mints a cookie (visitor_id attaches only if one already exists from an engagement act), queries are truncated/normalized text with no requester identity required, and retention is bounded. `scripts/learning.sql`'s honesty note gets updated the same day — the proxy documentation must not outlive the proxy. **Compliant.**

**"Zero-result moment — is telling buyers 'the makers hear about what people look for' honest?"**
Only if makers CAN hear it. LS-1 therefore must ship the learning section (top queries, zero-result queries) in the same increment, and LS-7 surfaces it to merchants. Until LS-7, the sentence stays modest: no promise of individual notification. Copy reviewed in the increment. **Conditional pass — copy must not overclaim.**

**"Chronological law and future ranking?"**
LS-4 is flagged as the constitutional pressure point: ranking may only arrive as a REGISTERED projection presented as an additional, explainable lens, with the chronological voice preserved and a diversity floor. That increment's review must re-verify this before build. **Deferred gate noted.**

**"Anything in the C12 inheritance list at risk of duplication?"**
Sweep of the plan: no new mail path, no new token scheme, no new rate-limit store, no new visitor identity, engagement facts read-not-rewritten. The one nearness: attention_facts vs engagement facts — resolved by the rule "explicit acts are engagement facts; passive acts are attention facts; no act is recorded twice." **Clean.**

## Verdict

**No major contradiction. Proceed directly into LS-1** under these binding conditions: (1) one table / one endpoint / one composable; (2) anti-poisoning mitigations mandatory; (3) zero-result copy must not overclaim; (4) `learning.sql` honesty note updated in-increment; (5) LS-4 re-reviews the chronological law before any ranking code.
