# C12 — LAUNCH FOUNDATIONS · PROGRAM PLAN

**Status:** For Founder approval · 2026-08-08 · no implementation authorized until approval
**Phase:** 1 of the ratified `POST_COMMERCE_ROADMAP.md`
**Purpose — the whole program in one sentence:** **make DOF safe and honest enough to put in front of real strangers.**
**Not the purpose:** generic "production hardening", performance work, growth features, or anything the Living Street owns.

Everything below was derived from the repository as it stands after C11 closure (v1.43.0), starting from the blockers named in `POST_COMMERCE_STRATEGIC_REVIEW.md` Part 1-B and Part 11, re-verified against code.

---

## 1. The stranger test

A stranger-safe platform must pass seven statements, each currently false:

| # | Statement | Today's reality |
|---|---|---|
| 1 | "When DOF says it will tell you, it tells you." | 21 finished letters + verification/reset/ops mail terminate in `SandboxMailer` (a log line). The promised dispatch letter does not exist at all — a standing copy-truth violation. |
| 2 | "The locks work when more than one door exists." | Rate limiting and WebAuthn challenges live in per-instance memory — decorative on any multi-instance/serverless deploy. Dev-identity mode (`NUXT_IDENTITY_MODE=dev` default) trusts a header. |
| 3 | "A buyer is a person, not a cookie." | Orders bind to a 1-year visitor cookie; clearing it orphans the order. Verification mail never arrives, so accounts can't be credibly completed or recovered. |
| 4 | "If something on the street is wrong, someone can say so — and someone can act." | No report intake exists anywhere. The enforcement machinery (`enforcement_hold`, standing cascade) is checked in 20+ reads and reachable by no one. |
| 5 | "The platform states its terms." | No terms, returns policy, impressum, or privacy page exists. |
| 6 | "We can recover what we hold." | Backups are assumed, never proven by a restore. |
| 7 | "Production is configured as production." | TD-007 env fallbacks to dev defaults; secrets/webhook/cron/settlement posture live as a checklist in heads, not a gated document. |

C12 exists to make those seven statements true — and nothing else.

---

## 2. Increment structure — the dependency analysis (challenging "two increments")

**Dependency facts:**
- Mail transport is a *prerequisite* of buyer-account credibility (verification and recovery must deliver) and of the abuse loop's acknowledgment letters. It depends on nothing.
- Durable security state, dev-identity retirement, and abuse intake depend on nothing, but form one adversarial-review domain.
- Legal surfaces are engineering-light and Founder/counsel-gated — they must not block engineering flow.
- The restore drill and production-config audit are proof-and-checklist work that should land *last*, over the finished code state.

**Option analysis:**
- **One increment** — a single unreviewable bucket mixing three unrelated hostile domains (deliverability, adversarial security, identity/recovery). Fails "independently testable and reviewable." Rejected.
- **Two increments** — forces either mail+security into one review (two unrelated failure vocabularies) or leaves a grab-bag second increment. Reviewability suffers for no schedule gain: the third increment is small. Rejected.
- **Three increments** — each is one coherent hostile-review domain with its own demonstration journey, and the dependency arrows all point forward (1 → 3 for mail-dependent account flows; 2 → 3 for the config audit covering the new stores). **Chosen.**

> **C12-1 The Letters Arrive** → **C12-2 Locks for Strangers** → **C12-3 A Person, and a Proven Recovery**

---

## 3. C12-1 — THE LETTERS ARRIVE

**OBJECTIVE.** Every letter the platform already writes is actually delivered to a real mailbox, reliably, exactly once, with failures visible — and the one promised-but-missing letter (dispatch) exists.

**BUSINESS VALUE.** Order confirmations, payout letters, dispute deadlines, verification and recovery mail are the platform's spine of trust; today they are all silently unsent. This increment converts finished product assets into delivered product. It also unblocks C12-3 entirely.

**CAPABILITIES.**
- Production `MailPort` adapter for one transactional mail provider (engineering chooses; HTTP API, EU-friendly), behind the existing port — `SandboxMailer` remains the test/dev binding.
- Delivery semantics: sends ride the existing outbox consumers (already exactly-once per (consumer, event) via the delivery ledger); provider calls follow the §7 discipline (no network inside a transaction); transient provider failures retry on the existing outbox backoff; permanent failures dead-letter loudly (existing mechanism) and surface in ops alarms.
- Bounce/complaint handling: provider webhook endpoint records bounce facts; a hard-bounced address stops receiving non-critical letters (state-derived suppression — no parallel subscriber store); ops visibility for bounces of *critical* letters (verification, payout, dispute).
- The **dispatch letter** ("it's on its way") — the missing consumer for the existing fulfillment-dispatched event, in the established letter voice. Closes the copy-truth violation.
- Identity mail (verification, reset) delivered through the same adapter; ops alarm mail delivered.
- Secrets via env only; no key in code; sandbox preserved for every test suite.

**REUSED PLATFORM COMPONENTS.** `MailPort`/`SandboxMailer` seam, outbox dispatcher + backoff + dead-letter, `event_deliveries` exactly-once ledger, notifications consumer registry, §7 boundary discipline, ops alarms, env config pattern.

**NEW COMPONENTS (unavoidable).** One provider adapter (~an HTTP client class); one bounce-webhook endpoint; one `mail_delivery_facts` table (send/bounce facts — needed because suppression and bounce visibility must be state-derived; nothing existing records per-recipient delivery outcomes); the dispatch-letter consumer.

**EXPLICIT NON-GOALS.** No letter redesign or copy changes beyond the new dispatch letter. No marketing/digest mail (Living Street). No preference center (a suppression fact is not a preferences system). No templating engine.

**DEPENDENCIES.** None. First.

**ACCEPTANCE CRITERIA.**
- Every existing consumer's letter arrives in a real inbox in staging, exactly once under event replay.
- Provider outage → letters retry and eventually deliver; dead-letters alarm; no letter is ever double-sent (ledger-proven).
- Hard bounce → suppression fact recorded; critical-letter bounce visible to ops; suppressed non-critical sends are skipped with an audit trail, not errors.
- Dispatch letter sends on the dispatched event; sandbox suites stay green untouched.

**DEMONSTRATION JOURNEYS.** (1) Buyer purchase → confirmation letter in a real inbox → merchant dispatches → dispatch letter arrives. (2) Payout completes → maker's letter arrives. (3) Password reset arrives and works end to end.

**FAILURE / HOSTILE SCENARIOS.** Provider 5xx storm mid-outbox-run; duplicate provider webhook for the same bounce; bounce webhook forgery attempt (signature verification); letter event replayed after delivery ledger row exists; provider accepted-then-bounced after success response; suppression race (send in flight while bounce lands).

**EXPERIENCE CHECKPOINTS.** Letters render in real clients (plain, honest, merchant-voiced); sender identity and reply-to posture decided and documented; no tracking pixels (calm-commerce posture holds in email).

**OPERATIONAL CHECKPOINTS.** Runbook: mail incident (provider down, bounce storm, wrong-recipient report); dead-letter drill performed; alarm wiring verified with a forced failure.

**SECURITY CHECKPOINTS.** Provider key env-only and rotatable; bounce webhook signature-verified; no PII beyond recipient+subject in logs; suppression facts respect the data manifest (owner, retention).

---

## 4. C12-2 — LOCKS FOR STRANGERS

**OBJECTIVE.** Security state survives restarts and instances; the dev back door is gone from every deployable path; anyone can report harm and an operator can act on it, with audit, end to end.

**BUSINESS VALUE.** These are the locks on the door strangers walk through. Without them, launch converts the first bad actor into an incident the platform can neither slow down nor respond to.

**CAPABILITIES.**
- **Durable rate limiting**: Postgres-backed limiter behind the existing `RateLimiter` seam (fixed-window row per key, atomic upsert; the existing per-endpoint budgets unchanged). In-memory stays for tests. *Simplest durable mechanism compatible with the architecture — no new infrastructure; a KV store is a recorded future option if measured contention ever demands it.*
- **Durable WebAuthn challenges**: `webauthn_challenges` table (hashed challenge, TTL, consumed-at) behind the existing `ChallengeStore` port — retires recorded debt D-40e.
- **Dev-identity retirement**: `session` mode becomes the only deployable mode; `dev` refuses outside test/dev context at process start (extending the existing production refusal to a boot-time gate); CSRF + auth middleware verified active in the deployable configuration; integration suite continues on the dev adapter by explicit test-container binding.
- **Abuse intake loop** (launch-critical minimum, per the review's chain): public **report** endpoint (any surface: store/product/deal/spark/order, reasons enumerated, anonymous-capable, rate-limited) → `abuse_reports` row → **operator visibility** as a new `abuse_report` arm in the existing state-derived alarms queue → **decision**: operator commands to place/lift `enforcement_hold` (store) and record the decision — the first real emitters for the already-built enforcement machinery → **enforcement**: existing 20+ read gates simply begin to matter → **audit**: existing per-domain audit logs on every step; reporter acknowledgment letter (via C12-1).
- **CSP tightening** (TD-006 nonce follow-up) and security-header verification on the deployable config.
- **Production env gates**: TD-007 — production boot refuses dev fallbacks (database URL, secrets, cron secret, identity mode, mail key); fails closed with named missing keys.

**REUSED PLATFORM COMPONENTS.** RateLimiter + ChallengeStore ports, ops alarms derivation pattern, `enforcement_hold` + standing-consequence machinery, audit logs, masked-404 gate classes, command-endpoint pattern, notifications (C12-1), data manifest.

**NEW COMPONENTS (unavoidable).** `rate_limit_buckets`, `webauthn_challenges`, `abuse_reports` tables (each declared in the manifest); one public report endpoint; two operator commands (hold/lift); one alarms arm. *No new services, no queues, no dashboards — ops remains API + runbook by design (Administration domain stays deferred).*

**EXPLICIT NON-GOALS.** No moderation queue UI, no content scanning/ML, no reputation, no blocklists, no appeals workflow, no full Trust & Safety program (Phase 4). No Redis/KV. No staff roles.

**DEPENDENCIES.** C12-1 for the reporter-acknowledgment and operator-notification letters (the intake loop itself works without them).

**ACCEPTANCE CRITERIA.**
- Rate limits hold across restarts and simulated parallel instances (two app processes, one budget).
- Passkey registration/authentication succeeds across a process restart mid-ceremony (challenge persisted), and a consumed challenge cannot replay.
- A deployable build with `NUXT_IDENTITY_MODE=dev` refuses to boot; with missing production env, boots refuse with named keys.
- Report → alarms arm → operator hold: the store vanishes from every public surface (existing gates) and its till closes; lift restores; every step audited; a suspended store's buyer-facing reads answer with the honest closed-shop copy, never an error.
- Full sweep green; no existing rate-limit budget loosened.

**DEMONSTRATION JOURNEYS.** (1) A stranger reports a counterfeit-looking product anonymously → operator sees it in the queue → places a hold → the storefront answers "this shop is closed for review" → lift after review → shop returns. (2) Passkey login across a deploy. (3) A scripted brute-force run hits the durable limits from two instances.

**FAILURE / HOSTILE SCENARIOS.** Report-endpoint flooding (rate limits + dedup per subject+reporter); hold placed on a store mid-checkout (existing gates refuse honestly — verify the buyer's copy); operator id spoofing attempt (allowlist + audit); challenge-store race (two ceremonies, one credential); limiter table growth (eviction policy proven); enforcement of a store with in-flight payouts (money machinery unaffected by holds — payouts complete; verify explicitly).

**EXPERIENCE CHECKPOINTS.** Report affordance is quiet and findable, never accusatory theater; closed-shop copy follows the honest-letters voice; no security surface exposes stack traces or internals.

**OPERATIONAL CHECKPOINTS.** Runbook: abuse triage (what merits a hold, what escalates to Founder, response-time posture); alarms arm exercised in staging; limiter/challenge tables in the manifest with retention.

**SECURITY CHECKPOINTS.** Adversarial review of the report endpoint (injection, enumeration, spam); hold commands step-up-gated and audited; CSP verified on every deployable page; secrets audit passes.

---

## 5. C12-3 — A PERSON, AND A PROVEN RECOVERY

**OBJECTIVE.** A buyer can be a durable person — create, verify, sign in, recover, see their orders, change what's theirs, and walk away — and the platform can prove it recovers what it holds. Production configuration becomes a gated document, and the legal surfaces exist behind Founder/counsel gates.

**BUSINESS VALUE.** Credible custody: of the buyer's identity, their order history, the platform's data, and its legal obligations. This is the increment after which a stranger can reasonably stake money and identity here.

**CAPABILITIES.**
- **Buyer account minimum** — answering the directive's six verbs with what commerce credibility requires and nothing more:
  - *create*: existing register + the existing visitor-claim (orders placed as a guest attach on register/login — machinery exists; finish and test the loop end to end);
  - *authenticate*: existing password + passkeys (now durable via C12-2);
  - *recover*: existing reset — now actually delivered (C12-1);
  - *inspect*: `/account` — their orders (the existing `/o` list bound to the account, surviving cookie loss), email, sessions (existing revoke-all), passkeys list;
  - *change*: email (verify-new-address flow — the recorded deferred email-change debt from WP-R1-B1), password (existing), passkey add/remove (existing);
  - *protect*: session revocation surfaced; step-up honored (existing).
  - Guest order access hardening: the dormant `guest_tokens` machinery finally earns its keep — the confirmation letter carries a scoped order-tracking link that survives cookie loss *without* requiring an account (buyer-choice posture preserved).
- **Legal surfaces**: pages + footer for terms (buyer + merchant), returns/withdrawal policy, impressum/operator identity, privacy. Engineering ships structure, routing, versioned-consent recording seam at register/checkout **with placeholder copy behind explicit `FOUNDER/COUNSEL` gates — no invented legal wording; the pages do not go live until the gate clears.**
- **Backup & restore PROOF**: automated production backup posture documented; the drill = restore a production-shaped backup into a clean environment and pass the money invariants there (L1–L3 recompute, order reconstruction runbook, counts). Criterion: *we proved we can recover*, recorded as a drill report with date and timings (RPO/RTO observed). Repeatable script + runbook.
- **Production configuration cutover document**: the audited checklist separating **code changes** (all landed by this increment) from **deployment configuration** — production Stripe account transition (Founder-owned keys, live webhook + secret, Connect settings), settlement posture (BE/EUR per certified law — Founder ratification), mail domain/keys, cron secret, storage, database, monitoring/alerting destinations, env gates. Each row: owner, status, verification step.
- **Launch checklist assembly**: the stranger-test statements (§1) each mapped to their proof.

**REUSED PLATFORM COMPONENTS.** Identity services (auth/session/passkey/recovery/claim), `guest_tokens` (dormant, built, tested), notifications (C12-1), order read surfaces, audit logs, step-up gates, release law.

**NEW COMPONENTS (unavoidable).** `/account` page (one surface — the review's "settings has one door" gap on the buyer side); email-change flow (one command + one letter); legal pages (static, gated); consent-record fact (manifest-declared); drill script + runbook. *No profile system, no preferences, no addresses book, no wishlist.*

**EXPLICIT NON-GOALS.** No consumer-profile system, no personalization, no saved payment methods, no address book, no order export, no account deletion automation beyond the existing data-manifest posture (a documented operator path suffices at launch scale — full DSR automation is registered debt with counsel input).

**DEPENDENCIES.** C12-1 (delivered mail is the substrate of verify/recover/change and the guest order link); C12-2 (durable locks precede inviting durable identities; env gates precede the cutover doc).

**ACCEPTANCE CRITERIA.**
- A buyer who purchased as a guest, registered a week later, and cleared cookies still sees their order; the letter's scoped link works without an account and expires per policy.
- Email change requires possession of the new address + step-up; old address is notified; recovery works throughout.
- The restore drill has been performed at least once, documented, with invariants green in the restored environment.
- Legal pages render with gate status visible internally; consent facts recorded at register/checkout once wording clears.
- The cutover document exists with every row owned and verifiable; sweep green.

**DEMONSTRATION JOURNEYS.** (1) Guest buys → letter link tracks the order on a fresh browser → registers → order is theirs forever. (2) Buyer loses password on a new device → recovers via delivered mail → revokes old sessions from `/account`. (3) The restore drill, narrated: snapshot → clean environment → invariants pass → an order reconstructed.

**FAILURE / HOSTILE SCENARIOS.** Claim collision (two accounts claim one visitor history); scoped-link leakage (token bound to order + TTL, no PII in URL beyond the token, revocable); email-change race with recovery (old address wins recovery during the window); restore of a backup taken mid-outbox-batch (exactly-once semantics hold after restore — the delivery ledger proves it); consent recorded against a superseded document version.

**EXPERIENCE CHECKPOINTS.** `/account` speaks the street's voice (a corner, not a control panel); the guest path never nags toward registration (calm posture); legal pages are readable, not walls.

**OPERATIONAL CHECKPOINTS.** Drill repeatable by one operator with the runbook alone; backup failure alarms; cutover checklist walked once in staging.

**SECURITY CHECKPOINTS.** Order-link tokens hashed at rest (existing pattern); step-up on email change and passkey removal; consent facts immutable; PII audit of the new surfaces against the manifest.

---

## 6. Minimum-complexity review (Part 7 discipline)

Every proposed addition, challenged:

| Proposed | Challenge: can an existing primitive do it? | Verdict |
|---|---|---|
| Mail provider adapter | Port exists; only the adapter is new. No queue needed — the outbox *is* the queue; the delivery ledger *is* idempotence. | **Justified** (1 class + 1 webhook endpoint) |
| `mail_delivery_facts` | Bounce/suppression must be state-derived; no existing table records per-recipient outcomes. Audit logs are not queryable state. | **Justified** |
| Postgres rate-limit buckets | Existing seam; Postgres pool exists; KV/Redis would be new infrastructure for fashion at launch scale. Revisit trigger recorded (measured contention). | **Justified, minimal** |
| `webauthn_challenges` | Port exists; recorded debt D-40e; same pattern as recovery tokens. | **Justified** |
| `abuse_reports` | Nothing fits: order_timeline is order-scoped, audit logs are append-only exhaust, alarms are derivations *over* state — a report IS new state. Generic subject reference so Phase 4 extends rather than replaces. | **Justified** |
| Operator hold/lift commands | The enforcement machinery exists unreachable; two commands are the missing emitters. No admin UI — alarms queue + runbook remain the operator surface. | **Justified** |
| `/account` page | No existing buyer surface can host inspect/change/protect. One page, existing components. | **Justified** |
| Email-change flow | Recorded deferred debt (WP-R1-B1); recovery-token pattern reused. | **Justified** |
| Consent fact + legal pages | Static pages + one fact table (manifest-declared). | **Justified** |
| Drill script + runbooks | Documents and a script; no runtime components. | **Justified** |
| ~~New scheduled jobs~~ | The existing cron tick needs no new lane; bounce handling is a webhook, suppression is state-derived. | **None added** |
| ~~New domains / services~~ | Everything composes into existing domains (identity, payments-adjacent ops, platform). Administration domain stays deferred. | **None added** |

Net: **5 small tables (all manifest-declared), 1 adapter, ~4 endpoints, 1 page, 0 new infrastructure, 0 new domains, 0 new jobs.** Minimal as *necessary and sufficient* — durable security state and delivery facts are safety, not bragging-rights violations.

---

## 7. What C12 will NOT build (binding prohibitions — Living Street and later phases own these)

Ranked discovery or any feed-ordering change · recommendation systems · merchant analytics or any attention reporting · behavioral personalization · social graph extensions · advanced reputation (reviews, scores, badges) · AI of any kind · major Workspace redesign · SEO systems beyond keeping robots.txt truthful (sitemap/enumeration belongs to the Living Street) · growth experiments, digests, referral or share mechanics · telemetry implementation (seams only, §8) · moderation UI/queues beyond the alarms arm · coupons/discounts/offers · store themes/custom domains · new payment methods or currencies.

If a C12 slice finds itself "needing" one of these, the slice is mis-scoped: stop and re-cut.

---

## 8. The Living Street boundary (recorded, not designed)

**Strategic hypothesis (recorded verbatim intent):** after launch readiness, DOF's next product problem is **ATTENTION** — the future system must eventually understand impressions, views, opens, clicks, saves, follows, searches, product visits, store visits, cart additions, purchases, and Sparks interactions. **None of that telemetry is implemented in C12.**

**Seams C12 must preserve (and may not foreclose):**
1. **Visitor identity plumbing stays intact** — the `dof_visitor` cookie and claim machinery are the future subject-spine of behavioral signals; C12-3's account work must extend, never replace, it.
2. **MailPort shape stays batch-capable** — the Living Street's follow-letters/digest must be new *consumers*, not a new mail system; nothing in the adapter may assume one-recipient-per-event semantics.
3. **`abuse_reports` subject reference stays generic** (store/product/deal/spark/order) so trust signals can later join attention signals without schema surgery.
4. **Privacy/legal surfaces carry a telemetry disclosure placeholder** — counsel reviews first-party behavioral collection wording once, in C12-3, so the Living Street isn't blocked on legal when it instruments.
5. **The alarms/ops pattern remains the operator surface** — the Living Street adds arms, not dashboards.
6. **No C12 code may depend on feed ordering** — the street stays chronological until the Living Street changes it deliberately.

---

## 9. FOUNDER DECISION REGISTER

### A. Market / legal identity (decide before public launch; engineering proceeds meanwhile)

| Decision | What exactly must be decided | Who |
|---|---|---|
| A1 Founding market + currency | Ratify **Belgium / EUR** as the founding market. The certified settlement law hardens it (`identity.country: 'be'`, EUR end-to-end); changing it later is a program, not a config edit. | Founder |
| A2 Operator posture | Marketplace facilitator vs merchant-of-record posture; who is the seller of record on the buyer's receipt; how the platform fee is invoiced to makers. Determines the terms' architecture. | Founder + counsel |
| A3 Merchant agreement | Whether launch requires a signed maker agreement beyond Stripe's connected-account ToS (fee schedule, the certified dispute-loss policy — DOF absorbs good-faith losses — payout timing, enforcement rights). | Founder + counsel |
| A4 Legal pages | Final wording for: buyer terms, maker terms, returns/withdrawal (EU consumer law: 14-day withdrawal posture for the marketplace's goods), impressum/operator identity, privacy (incl. the visitor cookie and the C12 telemetry-disclosure placeholder). | Counsel; Founder voice |
| A5 Tax / reporting | DAC7 platform-reporting obligations; VAT posture (marketplace deemed-supplier rules vs maker-liable); fee invoicing VAT. **Flagged since C10 as "before C12/launch"; requires counsel — no conclusions offered here.** | Counsel |

### B. Growth values — what the word-of-mouth law means today, and where it will bind

**The law as written** (`MOMENTS_WORTH_SHARING.md`): *"Word of mouth is the street's only growth engine by law (no ads, no referral mechanics)."* A shared moment must be real, must flatter the **maker** (not the platform), and must need no incentive. It explicitly bans: referral rewards ("give €5, get €5"), share-prompts after payment, platform-branded share images, and **share-count displays — "popularity is ranking's foot in the door."**

**What complies without question:** everything in C12; and, in the Living Street: SEO enumeration (distributing real storefronts), search, follow letters (a buyer chose the shop), the weekly note.

**Where it will genuinely bind — the decisions surfaced, not made:**
1. **Ranking vs the popularity clause.** The Living Street intends engagement signals (fires, saves, follows) to influence *placement*. The law bans *displayed* popularity; it is silent on popularity as an invisible ranking input — but its stated spirit ("ranking's foot in the door") anticipates exactly this. **Decision needed:** may real engagement signals rank the street silently (counts never displayed), or must ranking exclude popularity entirely (liveliness/recency/diversity only)?
2. **Cohort invitation.** Does programmatically inviting the first merchant/buyer cohort (First Light style) count as word of mouth or as a forbidden mechanic?
3. **Paid acquisition experiments.** Categorically forbidden by "no ads" (DOF buying ads, not selling them)? Or a Founder-controlled exception during launch?

The law itself is **not changed** by this program.

### C. Brand identity — the honest classification

**The tension:** the name **"Deals On Fire"** promises price-led, urgency-led discount discovery. The product that has emerged — and that every constitutional document enforces — is the opposite on purpose: story-led maker discovery, deals that are *stories at honest prices* (no discount engine exists, by design), calm-by-default, zero manufactured urgency ("never manufactures urgency" is written law; "🔥 fire" is the one legacy ember, as an appreciation gesture).

**Classification: this is a genuine product/brand architecture issue — not merely messaging, not merely positioning.** Reasoning: (a) a messaging issue could be fixed by a landing page explaining the name — but the name sets a *category expectation* (coupon site) that the product deliberately refuses, and Part 2 of the strategic review shows the mismatch lands at the weakest moment of the buyer journey (arrival/understanding), where no explanation surface currently exists; (b) a positioning issue could be fixed by choosing a different audience — but the audience the product serves (calm buyers of makers' goods) is the one the name repels, and the audience the name attracts (deal hunters) is the one the product will disappoint; (c) it is architectural because the identity already leaks into product decisions — the deals-not-discounts refusal, the fire vocabulary, the street metaphor — and future programs (Living Street) will pour concrete around whichever identity is chosen. **No rebrand is proposed.** The decision — keep-and-reframe, evolve the name, or split (DOF as the street's name, an expansion that de-emphasizes "deals") — is the Founder's, with a deadline of the public-launch milestone, before the first stranger forms the first impression.

---

## 10. Program-level acceptance

C12 is complete when the seven stranger-test statements of §1 are all true, each proven by a demonstration journey or drill record; the full sweep is green; the release law has run per increment; and the launch checklist maps every statement to its proof with only Founder/counsel-gated rows (legal wording, production keys, ratifications) remaining open.
