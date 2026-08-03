# COMMERCE FOUNDATION RETROSPECTIVE

**Status:** FOUNDATION CLOSURE — this document formally closes the Commerce Foundation
(C1–C10, v1.27.0 → v1.41.0, 66 merge commits, 41 architecture documents, 268
integration tests, five real-Stripe-discovered corrections). Written as a Principal
Engineer's retrospective, not a review: the aim is honesty about what the journey
actually taught, including where we were wrong.

Everything below assumes this platform is now the permanent floor under C11 and beyond.

---

## 1. The strongest architectural decisions

**Facts before state (P3).** Every payment state change cites an appended,
immutable provider fact. This sounded like ceremony in C4. By C10 it was the
difference between "we think the refund happened" and "here is the fact, its cause
key, its provider ref, and the balanced posting it justified." When real Stripe
contradicted our books (fee reversal, §5 below), the facts made the divergence
*provable* rather than arguable. Everything else that worked — reconciliation,
reconstruction-without-SQL, dispute settlement — stands on this.

**One money primitive, cause-keyed forever.** Refunds have exactly one
implementation, idempotent per `(intent, causeKey)`, schema-bounded
(`refunded ≤ captured` as a CHECK). Keystone, cancellation, return, and operator
goodwill are all *callers*, not implementations. Twelve hostile scenarios converge
because there is only one place money can move and it cannot move twice. The
CHECK constraint earned special mention: it tripped our own test restaging twice —
the law defending itself against its authors.

**Capture at system confirmation (Option A).** The single most-attacked decision
(four alternatives considered, one Founder correction about who "confirms") and the
most durable: it survived the Payment Element inversion, Connect, disputes, and
reconciliation without moving. The buyer's charge and the platform's stock
certainty happen at the same instant, by the system, on evidence.

**The deterministic sandbox twin.** Building a provider twin with *test-law*
determinism (magic decline amounts, transient refusal injection, recorded balance
transactions) meant twelve hostile scenarios run in CI forever, not once against a
flaky external. The twin is why C1–C9 could be built and certified before a single
real key existed. Its danger is documented in §3 — but as a decision it paid for
itself hundreds of times.

**State-derived everything.** Alarms, letters, gates, and queues are computed from
the tables that already hold the truth — there is no parallel "alarm store" or
"notification state" to drift. When the certification asked "is the dispute queue
correct?", the answer was a query, not an audit.

**Domains never import each other.** Structural port typing + one composition root
made the C10 payments rework possible without touching orders' internals: the port
shape changed, the container rewired, the saga re-entered. A tangled import graph
would have made §7 a rewrite instead of a resequencing.

**The rollback law** (`ok:false` rolls back). It bit its own authors at least four
times — and each bite was the law catching a real semantic confusion about whether
a failure should persist. Painful, correct, and now impossible to forget because
CONTRIBUTING says it in bold.

## 2. Decisions that saved us from production failures

- **The hostile-review cadence itself.** PRR-C1 found that payments acquiring a
  second pool connection inside the checkout's transaction deadlocks the entire
  application at ≥ pool-size concurrent buyers. That is a launch-day outage,
  found by a review that was instructed to *break* the implementation rather than
  defend it.
- **The Real Money Readiness Review's four criticals** were all confirmed by
  reality: zero real payments would have succeeded (no client confirmation);
  every real refund would have thrown (`reverse_transfer` unconditional); row
  locks would have been held across Stripe's network latency; chargebacks would
  have arrived into silence. The decision to *stop and attack before touching real
  keys* is the single highest-value process decision of the Foundation.
- **PRR-H1's 24-hour cap** on `payment_pending` — never silent, never eternal —
  plus the RM-H2 correction (void the card hold when the order dies) kept the
  honest-failure path honest with real money attached.
- **The keystone as cron-resumable ratchet** (aging_stage only moves forward, every
  stage re-derives from evidence): a cron dead for days resumes and walks every due
  stage to convergence. Designed under ORR pressure; proven in C6 tests and again
  live in C10.
- **No-keys-no-Stripe construction + G9.** The process *crashes* on a live key
  outside production. The class of incident where a developer shell quietly bills
  real cards cannot occur.

## 3. Assumptions that turned out to be wrong

1. **"The twin's authorize is like Stripe's authorize."** The deepest wrong
   assumption of the Foundation. The twin conflated *creation* with
   *confirmation*, so C4–C9 built flows in which nobody confirms the intent —
   structurally incompatible with real cards. The readiness review caught it
   (RM-C1) before reality did, but the assumption survived five increments
   because the twin's determinism made everything green.
2. **"Single-transaction atomicity is the safety."** True with an in-process twin;
   inverted the moment the provider is a network: the atomicity became the hazard
   (locks across latency, provider-succeeds-then-rollback drift). The C3 comment
   even predicted the split "in C4" — we carried the debt to C10.
3. **"A failed checkout should leave no trace" (the C3 vapor law).** Right before
   money, wrong after: a recorded decline is a *fact* with compliance value, and
   compensations that vanish on rollback cannot compensate an external side
   effect. §7 superseded it.
4. **"UNIQUE means unique."** `UNIQUE (kind, business_id, currency)` with NULL
   business_id let every platform-level posting mint a fresh ledger account —
   latent from C4 to C10, invisible because entry sums stayed correct and L3
   checks per-row. Found only when a live fee reversal read "the" platform account.
5. **"Balance transactions arrive in the money's currency."** They arrive in the
   *settlement* currency. Reconciliation was rebuilt around presentment sources.
6. **"Connect v1 is the stable floor."** New Connect enablements are v2-only. The
   pinned-API ritual protected request/response shapes, but not product-level
   deprecation of an entire creation surface.
7. **"Docs-verified equals reality-verified."** The PAYMENT_REALITY_REVIEW's
   official-docs verification caught much — and reality still delivered five more
   corrections. Documentation describes the API; only traffic reveals the platform.

## 4. Assumptions validated by reality

- **Option A's capture timing** — survived every stress unchanged.
- **Payout eligibility follows fulfillment evidence, never the provider's clock**
  — Connect's `payouts_enabled` slotted in as a *second, independent* gate
  exactly as designed; the live demo showed charges-on/payouts-off cleanly.
- **Attempt-key idempotency end to end** — browser storms, replays, crashes, and
  real Stripe all converged on one order, one capture; Stripe's own idempotency
  keys composed with ours precisely as the blueprint hoped.
- **The outbox/consumer seam** — letters gained replay-dedupe *for free* from the
  delivery ledger; three domains' events feed one mail idiom with no coupling.
- **Masked 404 gate classes** — every probe scenario (cross-tenant, non-operator,
  foreign buyer) answered the indistinguishable nothing, including under live keys.
- **The keystone is mechanically enforceable** — the founding bet of the whole
  platform. It fired automatically, with real money, against the real provider.

## 5. What evolved the most

**The payment lifecycle** — three major forms: (C4) authorize-inside-checkout →
(RM review) client-confirmation design → (C10) intent-born-unconfirmed, browser
confirms, webhook/return converge, §7 two-phase boundary journals every provider
call. Each form is documented in place (UPDATED_PAYMENT_LIFECYCLE §7–§8) rather
than rewritten, so the evolution itself is inheritable. **Reconciliation matching**
went through three reality-driven revisions in two days of live traffic —
presentment sources, dispute-sourced adjustments, transfer mechanics — which is
exactly what a matching engine's first contact with reality should look like.
**Failure semantics** moved from "vanish" to "persist as facts." The rest of the
Foundation — state machines, ledger laws, domain boundaries, experience corpus —
barely moved, which is its own finding.

## 6. Foundational engineering references (binding for all future work)

| Document | Why it is foundational |
|---|---|
| `UPDATED_PAYMENT_LIFECYCLE.md` (§7, §8) | The money lifecycle of record + the two written laws every provider-touching feature obeys |
| `CONNECT_FUNDS_FLOW.md` | Where every cent goes, per scenario, including disputes |
| `REAL_MONEY_READINESS_REVIEW.md` | The launch-gate method: attack, gate, then build |
| `CONTRIBUTING.md` — Platform laws | The three laws you cannot discover by reading one file |
| `UI_IMPLEMENTATION_CONTRACT.md` | Binding on every increment's surfaces |
| `ORDER_STATE_MACHINE.md` / `CHECKOUT_STATE_MACHINE.md` | The states that everything else derives from |
| `contracts/data/manifest.json` + the check-gate scripts | The data constitution and its enforcement |
| `docs/runbooks/*` | Support's executable knowledge; kept in lockstep with code by review law |
| `THE_DOF_WORKSHOP.md` + `BUYER_TRUST_MODEL.md` | The experience constitution the code serves |

## 7. Patterns to reuse everywhere in DOF

1. **The two-phase external boundary** (journal → call outside tx → settle behind a
   state flip, recovery sweep, attempts + alarm). This is not a payments pattern;
   it is *the* pattern for every external system DOF will ever call: mail
   providers, carriers, tax services, search indexers.
2. **Cause-keyed idempotent primitives** — one implementation per money-like
   effect, callers own causes, replays converge silently.
3. **Facts-then-state** — append the evidence, then move the state that cites it.
4. **State-derived queues/letters/alarms** — never a parallel store.
5. **Resumable step sagas** — steps persisted, every entry converges from recorded
   truth; re-entry is the crash-recovery mechanism, not a special case.
6. **Deterministic twins with failure injection** for every external dependency —
   plus the humility of §3.1: twins prove *logic*, only reality proves *integration*.
7. **Constitution gates in CI** (`check:*` scripts with locked contracts): drift
   fails the build instead of accumulating.
8. **Structural port typing + composition root** for all cross-domain seams.
9. **`ok:true`-with-state for persisting failures** — the rollback law's corollary.
10. **Hostile review before every irreversible threshold** — the process pattern
    that outranks all technical ones.

## 8. Mistakes never to repeat elsewhere

- **Network calls inside open transactions** — now a thrown error and a CI rule;
  treat any new external call the same way from its first line.
- **Compensations that roll back alongside the failure** while the external side
  effect persists. If the outside world moved, the record of it must survive.
- **Reading balances from account rows without a uniqueness guarantee** — and more
  generally: NULL inside a UNIQUE key is a bug factory; use partial indexes.
- **Letting a module accrete responsibilities silently** — `payments.ts` reached
  1,016 lines holding four concerns before the readiness review named it.
- **Coordinate-driven UI automation as a certification instrument** — the
  cross-origin iframe battles cost hours and proved nothing the API-level
  confirmation didn't; certify at the seam that is actually stable.
- **Assuming a provider's current API surface is its permanent one** — pin
  versions AND expect product-level deprecations (v1 → v2 Connect).

## 9. What I would redesign, knowing everything

Answering without protecting my own work:

1. **The §7 boundary belongs in C4, not C10.** The single largest rework of the
   Foundation was resequencing every provider call site late. The C3 code even
   contained a comment promising the split "in C4, when the real authorize
   arrives." We knew. We deferred. It cost a full slice of C10 plus test-law
   rewrites. The lesson is general: *when the twin is in-process, the boundary
   discipline feels optional; build it as if the network were already there.*
2. **Client confirmation should have been the only flow from C4.** The twin should
   have mirrored the Element handshake from day one (`created → client confirms →
   fact → capture`), with the instant-authorize mode as the exception for unit
   tests, not the default reality of five increments.
3. **A dedicated ledger account-resolution function** with NULLS-NOT-DISTINCT
   semantics from the first posting — the fragmentation bug was a five-line
   prevention.
4. **Store provider event payloads from the first webhook** (we added it in Slice
   4; forensics wanted it from C4).
5. **Model settlement vs presentment currency in the first reconciliation
   design** — the platform account's currency is a first-class fact of the money
   system, not an ops detail.
6. **The order row is a field cluster** (`state` + `aging_stage` +
   `hold_released_at` + `cancel_requested_at` + promise fields). It works, it's
   tested, but a cleaner separation of payment-state / fulfillment-state /
   protection-state would read better at year five. Defensible today; I would
   design it as three narrower concerns from scratch.
7. **What I would NOT change:** Option A, the ledger laws, the one-primitive rule,
   the twin strategy (amended per #2), the domain boundaries, the experience-first
   constitution, the hostile-review cadence, capture-at-confirmation, the keystone
   mechanism. The Foundation's skeleton is right.

## 10. Acceptable smells to watch through C11–C20

| Smell | Acceptable because | Watch trigger |
|---|---|---|
| One serial cron tick runs all lanes + sweeps | volume is near zero | ~1k merchants, or any lane starving another |
| Boundary's per-kind switch | 4 kinds | ~8 kinds → registry map (payouts will add 2) |
| `payments.ts` (1k lines) / `container.ts` (900) | split is mechanical, registered for C11 | first C11 payments PR should carry the split |
| N+1 case walks in aging/hold sweeps | indexed, tiny sets | sweep duration > a few seconds |
| Reconciliation category-matches transfers/payouts/fees | no payout identities exist yet | the moment payout initiation lands, match by identity |
| JSONB timeline messages as buyer-facing source | flexible, versionless | any need to query/migrate message *content* |
| Dev-header identity mode | dev-only, refused in prod | must be fully retired before any public beta |
| EUR assumptions in copy/quotes | single-market launch | first second-currency conversation |
| `AddressFields` per-field prop spreads | correct for human input | first C11 UI pass fixes it |

## 11. Metrics the Founder should watch after launch

**The one number:** reconciliation unexplained-unmatched count. It must be zero
every day. It is the single metric that transitively proves capture, refund, fee,
transfer, and dispute correctness — anything wrong anywhere in the money system
eventually surfaces here.

Daily: `provider_operations` pending age (p95 — should be seconds; hours means the
driver or provider is sick) and abandoned count · L3 drift accounts (permanently
zero) · webhook signature failures (~zero; a spike is an attack or a secret
rotation gone wrong) · ops alarm queue depth and time-to-acknowledge.
Weekly: keystone firings (stage-3 auto-refunds) and time-from-promise-to-refund —
the *protection promise's* SLA · payment_pending > 2h count · dispute rate and
freeze-coverage ratio · checkout→confirmed latency p95 (certified baseline: ~1–7s
webhook-dependent) · refund-op attempt distribution (a fattening tail = provider
friction). Monthly: platform_fees vs Stripe application-fee totals (should be
identical by construction; verifying the construction).

## 12. Five years out

**Most likely to require redesign:** the production clock (cron tick → queue
workers with per-lane isolation); the reconciliation engine (multi-currency,
multi-provider, payout identity matching, volume paging); operator surfaces
(the deliberately-minimal ops endpoints will eventually deserve the Administration
domain the constitution reserved); the dev-demo embedded-PG world (fine for a
team of one-to-five; a real team wants seeded ephemeral environments).

**Should remain almost unchanged:** the ledger core (balanced postings, append-only,
recompute identity); payment facts; the §7 journal + boundary pattern; cause-key
idempotency; the order/checkout state machines; the keystone mechanism and its
wording; domain boundaries and the composition root; the experience laws. These
are load-bearing walls; everything in the previous paragraph is furniture.

## 13. Could another team inherit this and build DOF correctly?

**Confidence: 8.5/10.** The reasons it is high: the laws are *written where they
bite* (CONTRIBUTING, §7 in the lifecycle doc, comments at the exact lines that
once failed); the constitution is *executable* (check-gates and contract locks
make a wrong contribution fail CI rather than merge quietly); the tests read as
documentation (each hostile scenario names the law it proves); the runbooks are
command-by-command; and the retrospectives — including this one — preserve *why*,
not just *what*. The deducted 1.5: the corpus is large enough that the entry path
matters (a new engineer must start at CONTRIBUTING → UPDATED_PAYMENT_LIFECYCLE →
the gates, and nothing enforces that reading order), and the experience
constitution's *voice* — street language, letters, the Workshop — is the one thing
a gate cannot check. A team that inherits the code inherits the machine; whether
they inherit the taste depends on them reading the experience corpus as law, not
as brand guidelines.

---

## CLOSURE

**What should never change**
The keystone promise and its mechanical enforcement. The ledger laws (L1–L3,
append-only, schema-bounded refunds). One money primitive, cause-keyed. Facts
before state. The §7 provider boundary. Capture at system confirmation. Domains
never importing each other. The masked-404 gate classes. The copy-truth law: the
interface may not say the untrue — and a truth that expires is an untruth.

**What should evolve carefully**
The state machines (additive states only, never reinterpretation). Fee and risk
policy values (founder decisions wearing configuration). Reconciliation matching
rules (each new provider behavior gets a rule, never a shrug). Module layout
(split, don't restructure). The notification idiom (new letters, same voice).

**What should probably be redesigned someday**
The single-tick clock. The reconciliation engine's scale model. Operator surfaces
into a true Administration domain. The order row's field cluster, whenever a
schema-era migration is warranted anyway. The dev world's seeding machinery.

**Would I build this architecture again from scratch?**
Yes — with two amendments I would tattoo on the first commit: *build the external
boundary as if the network already existed*, and *make the twin mirror the real
handshake, not a convenient one*. Everything else — the constitution-first
process, the hostile reviews at every irreversible threshold, the deterministic
twin, the facts-first money core, the experience corpus as binding law, and the
refusal to tag until reality itself had signed — I would repeat without
modification. The Commerce Foundation is not the code; it is the discipline that
produced the code. That is what C11 inherits.

**The Commerce Foundation (C1–C10) is closed.**
