# DOF Platform — ADR-005

# Ignite 2.0 — Intelligent Merchant Experience Architecture

**Status:** Accepted (constitutional) · **Version:** 1.1 · **Date:** 2026-07-05
**Authors:** CPO / CXO / Chief Trust Officer / Chief AI Architect / Principal Platform Architect / CTO (one pen)
**Binding docs honored:** ADR-001 v1.1 (Merchant), ADR-002 (Commerce), ADR-003 (Platform Integration), ADR-004 (Data Constitution), BLUEPRINT-001/002, DECISIONS.md D-01…D-31, UX-BIBLE-001 v1.1 (co-amended). Conflicts with frozen material are documented in §15 — never silently resolved.

**v1.1 amendment (AMENDMENT-001):** integrated the **Marketplace Trust Experience** (trust as the invisible operating system: the Trust Fabric §9, Recovery Journeys §2.5, the explanation quartet in §2.1/§8, trust metrics §14) and **DOF Signature Moments** (event-derived milestone orchestration §10, AI participation rules §8/§10). Proposal anatomy gained the *Assumptions* part. Sections renumbered from v1.0: Personas §9→§11, 2035 §10→§12, Boundaries §11→§13, Metrics §12→§14, Conflicts §13→§15, Decisions §14→§16.

**Supersession note:** ADR-001 §9 defined Ignite 1.0 — the Five-Minute Store flow. This ADR does not replace that flow; it **promotes Ignite from a flow to the operating layer of DOF** and makes the §9 flow its opening movement. Everything in §9 remains binding as written.

---

## 0. Challenges to the Brief (Read First)

House tradition: before designing what was asked, state where the ask is wrong or incomplete.

### 0.1 Five minutes is a solved problem. The unsolved problem is minute six.

ADR-001 §9 already spends the five-minute decision budget ruthlessly, and the vertical slice proves the machinery beneath it. Optimizing that number further buys nothing. The metric that decides whether DOF wins is **Time to First Deal** (already constitutional, ADR-001 v1.1 §16) and its leading indicator, which this ADR names the **First Sale Horizon**: the merchant's believed distance to their first sale, measured in *their* time. Every Ignite interaction must visibly shorten that horizon or it is noise. A beautiful store nobody visits *lengthens* the felt horizon — which is why Ignite 2.0's post-launch orchestration (Pulse proposals, the launch card, Community seeding) is not a nice-to-have; it is the product.

### 0.2 "Not a wizard" is right, but "an AI copilot" is also not the idea. The idea is a proposal engine.

The industry's default answer to this brief is a chatbot bolted onto an admin panel. We reject that. Chat is one *door* into Ignite. The **unit of Ignite is the Proposal** — a typed, previewable, reversible, schema-validated bundle of domain commands with evidence attached (§2). Conversations, imports, onboarding, nudges, and automations are all just different producers of the same object, and merchant approval is the same act everywhere. This one decision is what makes Ignite an operating system rather than a feature: new intelligence plugs in by producing proposals, and every safety property is enforced once, at the proposal layer, forever.

### 0.3 The brief says "with merchant approval" thirteen times. Thirteen approval dialogs is how you fail the Grandma Test.

Approval must be **ceremonial, not transactional**: batched into a small number of emotionally meaningful moments (the Mirror, the Reveal, the Launch — §3, §4) plus a graduated autonomy system for everything after (§2.4). A merchant who must click "Approve" 40 times during an import has not been kept in control; they have been made a rubber stamp, and rubber-stamping trains people to stop reading. Real control is: few decisions, high consequence-visibility, universal undo.

### 0.4 The principle set is missing three principles. We adopt them here and propose them for the constitution.

- **Reversible Over Confirmed.** Where an action is cheaply reversible, prefer *apply + prominent undo* over *ask first*. Confirmation dialogs tax everyone to prevent a mistake almost nobody makes; undo taxes only the mistake. (The frozen guardrails of ADR-001 §13.3 define what is *never* auto-applied; this principle governs everything below that ceiling.)
- **Never Ask Twice.** Any fact the merchant has expressed — in words, in a photo, in an imported file, in behavior — is Ignite's responsibility to remember and reuse. Re-asking is a defect with a severity level, not a UX nicety. (The event store is the memory that makes this enforceable — §12.)
- **Show the Work.** Every inference, suggestion, and generated artifact must be able to answer "why?" in merchant language, citing the merchant's own data. Confidence without evidence is forbidden output. (`AIProvenance` is the storage half of this; the explanation is the experience half.)

We also sharpen one existing principle: **Progressive Complexity must be bidirectional.** Complexity that appeared must be able to *retreat* when unused (§6.4). An interface that only ever grows is enterprise software on a delay timer.

### 0.5 The brief's Beginner → Growing → Professional → Enterprise ladder is not the Scale Tier ladder — and must not become it.

ADR-001 §0.3 established that merchants live on orthogonal axes (Trust, Scale, Standing). This ADR adds the fourth: **Surface Level** — how much interface a merchant currently *sees*. It correlates with Scale Tier but is deliberately independent: a Starter-tier restaurant needs location hours on day one; an Established-tier digital creator may happily live on Surface 1 forever. Tiers gate what a business *may* do (entitlements, frozen); Surface Levels gate what a merchant is *shown* (Ignite-owned, fluid, per-person). Conflating them would turn UX into a paywall — the exact enterprise-software feel we exist to destroy.

### 0.6 Trust is not a feature to design. Trust is the physics the design runs on.

The industry treats trust as a widgets problem: badges, star ratings, "verified" checkmarks. That framing produces trust *theater* — decoration that manipulable actors game and honest actors resent. The correct framing: **trust is the invisible operating system of the marketplace**, and every interaction either builds it, maintains it, or restores it — there is no trust-neutral interaction. This ADR therefore does not add a trust *feature*; it defines the **Trust Fabric** (§9): how the frozen trust mechanics (ADR-001 §10's ladder, standing, escrow) become a lived experience for merchants, buyers, and the community — and it makes **Trust Recovery a first-class product experience** (§2.5), because the moment trust is tested is the moment it is actually manufactured. A marketplace differentiates not by never failing but by how it behaves when it fails.

### 0.7 Software that only completes tasks is forgettable. Progress that is *witnessed* is what merchants remember.

Task completion is table stakes. What no incumbent does well is **noticing**: the platform seeing that this order was the *hundredth*, that this customer *came back*, that a year ago this business was one typed sentence. DOF is architecturally privileged here — the event store already remembers everything — so **Signature Moments** (§10) are not a gamification layer bolted on; they are the event history, surfaced with taste. The objective is never celebration for its own sake: it is reinforcing progress, confidence, and achievement, under strict anti-noise budgets (UX-BIBLE-001 §14), because emotional connection to the platform is what survives the first bad week.

---

## 1. Position in the Architecture

### 1.1 What Ignite is

Ignite is the **orchestration domain**: the intelligence layer that reads every domain's published language, plans across them, and acts on them exclusively through their public command gates. It is the conductor; the domains are the instruments; the score is the merchant's intent.

```
                    ┌──────────────────────────────┐
                    │            IGNITE            │
                    │  proposals · dossiers ·      │
                    │  autonomy ledger · surface   │
                    │  state · journeys · moments  │
                    └──────┬───────────────────────┘
          reads events / projections │ writes ONLY via command gates
   ┌──────────┬──────────┬───────────┼──────────┬──────────┬─────────┐
   ▼          ▼          ▼           ▼          ▼          ▼         ▼
 Merchant   Commerce   Media      Community  Analytics  Identity  (future:
 (frozen    (catalog,  (frozen    (planned)  (planned)  (frozen   Orders,
  kernel)   inventory,  seams)                           surface)  Logistics,
            pricing,                                               Taxonomy…)
            offers…)
```

### 1.2 What Ignite owns (and the honest resolution of "owns no data")

The brief says Ignite owns nothing. Precisely: Ignite owns **no business truth** — no products, inventory, orders, prices, policies, brand, and *no trust facts* (verification state, standing, fulfillment history are Merchant/Commerce/Administration truth). It does own its **orchestration state**, because a coordinator without memory is a wizard with amnesia:

| Ignite-owned state | What it is | Why it isn't business data |
|---|---|---|
| **Proposals** | Pending/approved/expired proposal objects (§2) | Drafts of *intent*; the truth lands in owning domains on approval |
| **Import Dossiers** | Staged interpretation of external catalogs (§5) | A workbench; discarded or landed, never queried as truth |
| **Autonomy Ledger** | Per-capability autonomy grants (§2.4) | Configuration of Ignite itself |
| **Surface State** | Per-merchant visible-complexity level + reveal history (§6) | A rendering preference, reconstructible |
| **Journey State** | Where the merchant is in a multi-step orchestration (genesis, import, recovery, verification nudge…) | Saga state, per ADR-003 P5 |
| **Moment Ledger** | Which Signature Moments fired, when, at what intensity (§10) | Anti-repetition memory; the achievements themselves live in domain events |

Reconciliation: BLUEPRINT-001's `ignite_drafts` (genesis session state) is the first Journey State table — already correctly placed. All Ignite tables follow ADR-004 (manifest-first, UUIDv7, no cross-domain FKs; references to domain aggregates are ids by value, never constraints).

### 1.3 The five laws of Ignite (non-negotiable)

1. **No side door.** Every Ignite write is a normal domain command through the triple gate (RBAC → Entitlement → Trust), executed under the AI Assistant membership of ADR-001 §12.2 or the merchant's own identity when they act. Frozen guardrail ADR-001 §13.3 is inherited whole as the autonomy *ceiling*.
2. **One writer per fact** (ADR-003 §3). Ignite never caches domain truth writably; its reads are events and sanctioned queries/projections.
3. **Proposals are contracts.** Every proposal's command plan is schema-validated against the same `contracts/` definitions the API enforces. An LLM cannot emit a malformed command into the platform — invalid plans die in Ignite, visibly (the M-6 philosophy applied to intelligence).
4. **Provenance everywhere.** Everything Ignite lands carries `AIProvenance`; direct merchant edits supersede it (D-29c). "What did the AI touch?" is always answerable, forever. This is the mechanical substrate of AI trust (§9.4): a black-box Ignite is structurally impossible, not merely discouraged.
5. **Compensation, not deletion.** When Ignite unwinds something (failed genesis, reverted import), it compensates through domain commands (archive, unpublish, restore) per ADR-003 P5 — never raw deletion (ADR-004: no CASCADE, tombstones only).

---

## 2. The Proposal Protocol (the constitutional core)

### 2.1 Anatomy of a Proposal

Every intelligent act in DOF is one object:

| Part | Content | Experience it powers |
|---|---|---|
| **Intent** | One merchant-language sentence: *"Add a 'Weekend 15% off' deal on your 3 most-viewed blankets."* | The headline the merchant actually reads |
| **Evidence** | The data that justified it, cited: *"142 views this week, 0 deals running; similar stores convert 3× with a weekend deal."* | Show the Work (§0.4) |
| **Assumptions** | What Ignite took as given and did not verify: *"Assumes your weekend inventory can cover a 3× order pickup."* | The honesty part — an unstated assumption is where AI trust dies; stating it converts a blind spot into a shared checklist (§9.4) |
| **Plan** | The exact domain commands to execute, schema-validated | Engineering truth; also renders the "what exactly will happen" expander |
| **Preview** | The rendered after-state (storefront card, price table, policy text) | Merchants approve *outcomes*, never command lists |
| **Reversibility class** | R0–R3 (§2.2) | Determines the approval ceremony required |
| **Confidence + expiry** | Ignite's own certainty, calibrated; stale proposals self-expire (ADR-001 §13.3: no pile of stale robot work) | Low confidence renders as a question, not a suggestion |
| **Provenance** | Model, prompt version, inputs digest | Audit + revert |

Intent, evidence, confidence, and assumptions together form the **explanation quartet** — the four questions every Ignite recommendation must answer (*why · on what evidence · how sure · assuming what*). The quartet is constitutional: a proposal that cannot fill all four parts is not rendered (§9.4).

### 2.2 Reversibility classes

| Class | Definition | Examples | Maximum autonomy possible |
|---|---|---|---|
| **R0 — trivially reversible** | One-command undo, zero external observers | draft edits, internal names, tags, collection membership | Auto-apply with undo toast (if granted) |
| **R1 — reversible, externally visible** | Undoable but customers may have seen it | published copy changes, homepage layout, product reordering | Apply-with-undo (if granted), digest-reported |
| **R2 — consequential** | Reversible in mechanism but not in effect | prices, deals, shipping rates, publishing a product, sending messages | Always a proposal; approval per item or per granted standing rule |
| **R3 — irreversible / constitutional** | Cannot be undone or touches money, people, legal identity | payouts, staffing, closures, transfers, policy *binding*, anything in ADR-001 §12.3 | **Never autonomous at any setting** (frozen ceiling) |

### 2.3 Approval ceremonies, not approval dialogs

Three ceremony shapes cover everything:

- **The Moment** — a single proposal worth a decision (an R2): full-screen card, preview, evidence, one yes/no. Rare by design; a merchant should see a handful per week, not per hour.
- **The Bundle** — many related proposals approved as one narrative (the Reveal after genesis, an import landing, "holiday readiness pack", a recovery journey §2.5). One decision covers the set; every item individually inspectable and excludable. Cognitive shape: *"Here's your store — want it?"* not 13 questions.
- **The Standing Rule** — the merchant teaches Ignite a policy once: *"Yes, and do this automatically from now on"* is offered on every second identical approval (Never Ask Twice, applied to approvals themselves). Standing rules live in the Autonomy Ledger, are listed in one place, and revoke with one tap.

### 2.4 The Autonomy Ledger

Per capability area (copy, pricing, merchandising, inventory, imports…), the merchant holds a dial:

**Suggest** (Ignite speaks when spoken to) → **Draft** (proposals appear in Pulse) → **Apply-with-undo** (R0/R1 land silently, digest-reported) → **Autopilot** (R2 standing rules execute; e.g. "reorder stock from my supplier when below 5, up to €200/week").

Defaults start at *Draft*. Movement up the dial is **offered by Ignite only after earned trust** — N approvals without a reversal — and shown with a track record: *"You've approved 14 of my last 14 price suggestions. Want me to apply future ones automatically? You can always undo."* Trust Before Growth applies to the AI too: **the merchant's trust in Ignite is progressive, evidence-based, and revocable — exactly like DOF's trust in merchants.**

The dial moves *down* the same way it moves up — on evidence. When the merchant reverses an autonomous action, Ignite **demotes its own autonomy in that capability one notch, tells the merchant it did, and explains what it learned** (*"You undid two of my collection changes — I've gone back to asking first for merchandising."*). Self-demotion is the single strongest AI-trust signal we can ship: it proves the ledger is a contract, not a ratchet. Every autonomous action is audited under the AI membership and appears in a weekly plain-language digest ("What I did for you this week").

### 2.5 Recovery Journeys — trust repair as first-class orchestration

Things go wrong: a shipment stalls, stock oversells, a launch flops, Ignite itself errs. The frozen machinery treats these as states; the *experience* must treat them as **the moment trust is actually manufactured**. A Recovery Journey is a P5 saga whose deliverable is restored confidence, initiated by Ignite when trust-damaging events appear in the stream:

| Trigger | The journey Ignite orchestrates |
|---|---|
| **Delivery issue** (carrier stall, missed promise) | Proactive disclosure *before the customer asks*: a proposal bundling an honest customer note, a revised date, and an optional goodwill gesture — merchant approves in one act. The buyer learns DOF merchants tell them bad news first (§9.2) |
| **Inventory mistake** (oversell) | The honest-options bundle: apologize + refund, apologize + backorder with real date, or substitute-with-consent — cost math and relationship math shown for each. Never silent cancellation |
| **Merchant mistake** (wrong price honored, wrong item shipped) | Own-it-fast repair: drafted apology in the merchant's voice, the make-good, and the prevention step (*"want me to require a confirm on prices under €5?"*) — repair *and* learning in one bundle |
| **Dispute** | The fair-judge experience (UX-BIBLE-001 §10): evidence assembled for *both* sides, resolution options with consequences explained; escalation to platform mediation visible and non-threatening |
| **AI mistake** | Ignite self-reports in the digest and in place (*"I mispriced the bundle draft — reverted before publish"*), reverts via provenance, and self-demotes (§2.4). Ignite never quietly buries its own errors — the audit trail makes concealment impossible (Law 4) |
| **Failed launch / flat week** | Not a "recovery" the merchant asked for: steadiness first (UX-BIBLE-001 §7.2 — silence over suggestions in grief), then, when re-engagement signals appear, one concrete next step with evidence — never a pep talk |

Design laws for every journey: **speed beats polish** (acknowledgment within the customer's attention window), **disclosure beats discovery** (DOF-side failures are announced by DOF, in plain language, with what happened and what we changed), **the merchant stays the author** (Ignite drafts repair, the merchant signs it — R2 minimum, always), and **repair ends with prevention** (every journey's last step is the standing rule or fix that makes recurrence rarer). The service-recovery paradox — that well-repaired trust often ends *higher* than untested trust — is treated as an observation, never a strategy: engineering a failure to perform a recovery is a firing offense (UX-BIBLE-001 §15).

---

## 3. The First Five Minutes (Genesis)

ADR-001 §9 stands as written — the invitation, the conversation, the mirror, the first thing, the claim, the launch, with its psychology intact. Ignite 2.0 extends it in three ways without adding a second to it.

### 3.1 Three doors, one conversation

Step 1's single question — *"What do you want to sell?"* — now accepts three kinds of answer, auto-detected, never presented as a mode choice:

- **Tell me** — free text or voice (the existing path).
- **Show me** — photos, camera-first. A stall photo, a product spread, a handwritten menu. Vision models draft the catalog from what they see.
- **Bring it** — a URL or handle: an Instagram profile, an Etsy shop, a Shopify store, a Linktree, a spreadsheet. This seeds an **Import Dossier** (§5) *in the background* while genesis continues; the mirror in Step 2 reflects their *existing* brand back at them ("We found Rosa's Ceramics — 34 products, warm terracotta palette. This is your store."). For the already-selling merchant this is the single highest-magic moment we can build: **DOF knows them before they sign up.**

### 3.2 What Ignite infers, and the question budget

The irreplaceably-human questions remain the frozen three (what do you sell · what's it called · show one thing). Everything else is inferred with declared confidence: locale → currency, units, tax defaults; category language → fulfillment kinds, shipping shape, persona preset (§11); photos → palette, product attributes; time of signup + phrasing → tone of voice. Low-confidence inferences are **not asked about during genesis** — they surface later as R0/R1 proposals at their moment of relevance (Never Ask Twice ∧ never ask early what can be asked never).

### 3.3 How the first five minutes must feel

Momentum, recognition, and safety — in that order. Concretely: the merchant never sees a blank field after the first question (everything else is pre-filled for editing, not asking); every screen visibly *builds* something (progress is the store materializing, not a progress bar); and the exit is always open with everything kept (drafts persist forever, frozen §9). The emotional contract: **"You already had a business. We just made it visible."**

Genesis is also where the Trust Fabric starts weaving (§9): the new store is **born trustworthy by construction** — honest default policies, platform-secured payment rails, escrowed funds until verification (frozen §10 mechanics) — so a day-one merchant can look a buyer in the eye. Trust the merchant hasn't earned yet is *platform-vouched* and labeled as such ("New store · payments protected by DOF"), converting the cold-start problem into a platform promise rather than a merchant handicap.

---

## 4. Store Genesis — Automatic Configuration

Everything the brief lists is drafted by Ignite in owning domains, born as drafts, and approved in **one ceremony — the Reveal** (a Bundle): the finished store shown as a customer would see it, with a "what I set up for you" drawer listing every artifact, each inspectable, editable, or excludable. One decision. Then Launch (frozen Step 5) publishes.

| Artifact | Owning domain | Drafted from | Class | Notes |
|---|---|---|---|---|
| Store + handle | Merchant | name choice (mirror) | R1 | HandleService reservation, frozen |
| BrandKit (logo, palette, type, voice) | Merchant | photos, name, category | R1 | designer-grade default, AI-tuned (Beautiful by Default) |
| Categories & collections | Commerce (merchandising) | catalog interpretation | R0 | smart collections where derivable |
| Products + templates | Commerce (catalog) | door input / dossier | R1 | born draft (frozen lifecycle); per-persona product templates are pre-filled attribute sets, not schema |
| Inventory + default location | Commerce (inventory) | fulfillment kind | R0 | physical goods: single default location, "track quantities?" deferred until it matters (§7) |
| Shipping profile | future Logistics seam | locale + category norms | R2 | ships as a *named default* ("Standard: €4.90, free over €50 — typical for your category"); rates are money → R2 |
| Return policy · Tax defaults | Merchant (PolicyText, tax VO) | locale + business type | **R2, two-step** | drafts live immediately as *displayed text*; become **binding** only on explicit merchant confirmation, plainly labeled ("review before your first sale" — a Pulse task, not a genesis blocker). Legal text is never silently authored into force |
| Homepage + navigation | Merchant (storefront config) | brand + catalog shape | R1 | navigation derived from collections; homepage from best media |
| AI content (descriptions, SEO, alt text) | respective owners | everything above | R0/R1 | full `AIProvenance`, one-tap revert per field (frozen) |

Two rules make this safe at scale: **draft-first everywhere** (nothing customer-visible exists before the Launch ceremony) and **the two-step policy pattern** for anything with legal weight — visible immediately, binding only on review. The two-step pattern is a buyer-trust foundation as much as a merchant safeguard: every policy a buyer reads on a DOF store was *consciously confirmed* by a human merchant, which is what lets the platform stand behind it (§9.2).

---

## 5. Import Architecture

Imports are Ignite's flagship muscle: for every merchant who already sells somewhere, the import *is* the onboarding.

### 5.1 Source Adapters — the extensibility contract

Every source (CSV, Excel, Shopify, WooCommerce, Amazon, Facebook, Instagram, Etsy, Square, Lightspeed, direct API) is an **adapter** behind one contract, per ADR-003 §6 (external systems live behind ACLs; their models never leak inward). An adapter declares a **capability matrix** — what it can fetch (products, variants, media, inventory, customers, reviews, orders), whether it supports **one-time move** vs **continuous sync**, and its auth shape. Ignite orchestrates identically regardless of source; adding source #12 is writing an adapter, touching nothing else. Files (CSV/Excel) are just adapters whose "fetch" is a parse — including the AI column-mapper that reads *meaning* ("this column is prices in pence; this one is variant sizes embedded in titles").

One trust rule governs all adapters: **imported reputation is displayed, never blended.** A merchant may show their Etsy review history on their DOF store — clearly labeled as Etsy's, verifiable at the source — but external stars never enter DOF's own trust records (§9.1). DOF trust is earned on DOF; anything else is purchasable and therefore worthless.

### 5.2 The Dossier lifecycle

**Connect → Fetch → Interpret → Propose → Land → Reconcile.**

*Interpret* is where intelligence lives: mapping foreign shapes onto DOF's model (Shopify option sets → option VOs; Etsy variations → variants; Instagram captions → titles, descriptions, and price extraction), deduplicating, flagging suspicion (596 identical descriptions; a €2 price that's probably €200). *Propose* renders one Bundle: "34 products ready · 3 need your eyes" — the merchant reviews exceptions, not rows. *Land* executes as ordinary `CreateProduct` commands — born drafts, batch-tagged, field-level provenance (`imported:etsy` vs `ai:interpreted` vs `merchant:edited`), SKU collisions resolved in merchant language (D-31's `SKU_TAKEN` becomes a merge/rename/skip choice, never an error dump). *Reconcile* is the honest ending: a report of what landed, what didn't, and why — and **batch undo**: one act archives everything a landing created (compensation, not deletion — §1.3).

### 5.3 Move vs mirror

One-time **move** is the default story ("bring your business here"). **Continuous sync** (where the adapter supports it) is a standing rule in the Autonomy Ledger: field-level ownership ("Etsy owns inventory counts; DOF owns descriptions") with conflicts surfacing as proposals. Sync is how DOF respectfully coexists as a *second* channel until it earns being the first — Opportunity First applied to migration itself.

---

## 6. Progressive Complexity — Surface Levels

### 6.1 The mechanism

Every capability in the workspace declares a **reveal trigger** — the observed signal that makes it *useful now*:

| Surface | Merchant reality | Example reveals (trigger → capability) |
|---|---|---|
| **S0 — First Days** | "I have a store" | 5 calm nouns (frozen IA, ADR-001 §11): Pulse, Catalog, Offers, Orders, Settings |
| **S1 — Selling** | orders arriving | first physical order → fulfillment tasks; 10th product → inventory counts; first review → the reviews surface and the track record (§9.1); first "where's my stuff?" → tracking |
| **S2 — Operating** | selling is routine | oversell near-miss → stock tracking proposal; recurring buyer → customers surface; steady volume → insights, suppliers, barcode |
| **S3 — Scaling** | delegation & structure | second location need → locations; staff invited → roles UI; accountant asks → exports, then accounting integration |

Reveals are **event-driven, not menu-driven**: capabilities appear as *answers to a problem the merchant just had*, delivered as a Pulse proposal ("You nearly oversold the blue blanket. Want DOF to track quantities? 30 seconds."), never as a feature tour. The capability registry still gates what a business *may* use (frozen); Surface Level only gates *presentation* — a merchant can always search/ask for anything they're entitled to, and asking is itself a reveal signal. Trust surfaces follow the same law: verification prompts arrive at their **moment of natural motivation** (approaching payout threshold — ADR-001's frozen `VerificationNudgePolicy`), never as day-one bureaucracy.

### 6.2 The complexity budget

Each surface has a hard noun budget (S0: 5 top-level items — frozen IA). A reveal that would exceed budget must displace or nest, forcing real prioritization. Enterprise software is what happens when nobody has to choose.

### 6.3 No separate products, no modes

One codebase, one IA skeleton (frozen, ADR-001 §11), navigation order fixed for spatial memory. Beginner-to-Enterprise is the same workspace at different reveal states — the same way a Business moves Starter → Enterprise without changing platforms.

### 6.4 De-escalation

Revealed-but-unused capabilities (90 days, no interaction, no dependent data) fold back with a note in the digest. Complexity is a loan, and Ignite pays it back.

---

## 7. Merchant Operations

Governing rule: **operations arrive as tasks, not modules.** The merchant's operational home is the Pulse feed — "3 orders to pack · 1 return to decide · blue blanket low" — where each task carries its full context and a one-tap action. Modules exist underneath for the merchant who goes looking; nobody is *sent* to a module.

Each area's **simplest true form**, and its growth path:

- **Inventory** starts as a number on the product — optional. Tracking is proposed at the first oversell risk (S2 reveal). Grows: adjustments-with-reasons (a ledger, not an edit — the event-sourced mindset surfacing in UX: *"correction: −2, damaged"*), then multi-location, then transfers. Never before needed. An oversell that slips through anyway triggers the inventory Recovery Journey (§2.5) — the mistake is also the moment the tracking proposal finally lands.
- **Locations** don't exist until the second one does. The default location (genesis, §4) is invisible — it becomes a *concept* the day the merchant needs a market-stall stock split or a second kitchen.
- **Shipping** starts as one question with a category-informed default: "Who pays shipping?" Flat rate → free-over threshold (proposed when data shows it pays) → weight/zone tables (S3) → carrier rates via adapters. The merchant tunes *outcomes* ("free shipping over €50"), Ignite maintains the tables. Delivery estimates shown to buyers are **promises, not marketing**: Ignite quotes dates it can defend from carrier data, because every kept date is a deposit in the fulfillment record (§9.1) and every missed one triggers proactive disclosure (§2.5).
- **Returns** start as the beautiful default policy (§4). Each return is a decision card with evidence (photos, history, cost math both ways). Patterns become proposals: "6 returns on the ceramic mug, all 'smaller than expected' — the photo reads large. Reshoot or add dimensions?" Return *analysis* is Copilot work; return *approval* is R2 forever. Returns are the single highest-leverage trust surface in commerce — handled generously and fast, they convert a disappointed buyer into a repeat customer more reliably than any campaign (§9.2).
- **Fulfillment** is a to-do list, never a WMS: pack → label (bought in-app via carrier adapter) → handoff. Batch actions appear when volume does; barcode scanning appears when a phone camera would beat reading (S2); pick-paths and wave-picking are S3 words we refuse to say before then. Quietly, every on-time handoff writes the merchant's fulfillment history — the track record builds itself from ordinary work, which is the only honest way a track record can build (§9.1).
- **Suppliers** begin as a name on a product ("where do you get this?" — asked once, at a natural moment). Grows: reorder proposals with one-tap PO → supplier autopilot as a bounded standing rule (§2.4).
- **Imports / Stock adjustments / Barcode** — §5 dossiers for bulk; ledgered adjustments; camera-first barcode at S2.
- **Warehouse / Carrier / ERP / Accounting integrations** — all Source-Adapter-pattern seams (§5.1) at S3, behind ACLs (ADR-003 §6), *offered by trigger* (accountant email detected → "want a Xero connection or a monthly export?"). ERP is where DOF meets enterprise reality without ever showing enterprise UI to anyone who didn't ask.

---

## 8. The Copilot — Ignite's Voice

There is **one brain**. "Pulse" is its feed (proposals + tasks + insights, in the frozen order: attention → opportunities → how you're doing). "Assistant" is its conversational door. Both surfaces read and write the same proposal stream — a suggestion dismissed in chat never reappears in the feed (Never Ask Twice). This unifies ADR-001 §11's Pulse and Assistant entries as two doors to one mind (soft amendment, §15).

**Grounding rules (constitutional):** the Copilot may only assert facts derivable from the merchant's own data (events, projections) or clearly-labeled platform benchmarks; every recommendation answers the **explanation quartet** (§2.1) — *why it recommends, on what evidence, with what confidence, under what assumptions*; anything it cannot ground it must say plainly ("I don't know yet — you'll have data after ~20 orders"). It acts **only** by producing proposals — the chat has no privileged write path (Law 1). It speaks the merchant's persona vocabulary (§11) and never platform jargon: "the blue blanket" — never "SKU BLK-042," never "variant." And it is a **supportive business partner, never a performer**: it congratulates only real achievements, with the evidence in hand (§10.3), and it never manufactures enthusiasm.

**Capability → ceiling map** (each per-merchant dial capped by class):

| Capability | Class ceiling | Shape |
|---|---|---|
| Product creation & description writing | R1 | drafts, provenance, revert (frozen §13) |
| Pricing & deal suggestions | R2 | proposal with reasoning + range; *never autonomous price changes* (frozen §13.3) |
| Inventory insights, low-stock alerts | R0 alert / R2 reorder | reorder autopilot only as bounded standing rule |
| Shipping recommendations | R2 | outcome-level ("free over €50 pays for itself — here's the math") |
| Return analysis, duplicate detection | R0 insight → R1/R2 fix | fixes are proposals |
| Trust repair drafting (§2.5) | R2 | recovery journeys: Ignite drafts the apology/make-good/prevention bundle; the merchant signs — repair is always authored by a human signature |
| Milestone recognition (§10) | R0 experience / R2 follow-up | noticing is free; the "turn your 100th order into a thank-you post" follow-up is a proposal |
| Fraud signals | alert + platform Trust hooks | merchant-facing part advisory only; enforcement is Administration's, never Ignite's |
| Business health ("Pulse score") | narrative only | the Product readiness checklist pattern (D-28) grown to business scope: explainable, itemized, each item a proposal — a to-do list, never a grade to feel bad about |

---

## 9. The Trust Fabric

Trust is the marketplace's invisible operating system (§0.6). The *mechanics* are frozen elsewhere — the verification ladder, standing, escrow (ADR-001 §10), the triple gate, immutable audit (ADR-004). This section defines the **experience layer**: how those mechanics become the felt confidence of three constituencies. One law binds all of it: **every interaction builds, maintains, or restores trust — design accordingly.** (Adopted as a constitutional principle in UX-BIBLE-001 §2.)

### 9.1 Merchant trust — the track record, not the score

A merchant's trustworthiness on DOF is presented as a **record, not a rating**: verification state (identity → business → banking, the frozen ladder), longevity ("selling on DOF since March 2026"), fulfillment history (orders completed, on-time rate), customer satisfaction (reviews, repeat-customer rate), and responsiveness — each item **evidence, not adjectives**, each explorable to its source (Show the Work applied to reputation). Design laws:

- **Earned, never purchased.** No paid placement dressed as trust, no bought badges, no subscription tier that "boosts" credibility. The only path to a better record is better commerce. (Anti-gamification: no points, no levels, no leaderboards of trust — a track record reads like a *reference*, not a game profile.)
- **Built from ordinary work.** The record accrues from events the merchant generates anyway (§7) — there is no "trust farming" activity to perform, so there is nothing to game.
- **New is not suspicious.** The cold start is platform-vouched (§3.3): escrow and DOF's guarantee cover the buyer while the record is short, and the display says "new" with dignity, never with alarm.
- **Professionalism is coached, not policed.** Ignite proposes what improves the record (answer times, photo quality, policy clarity) as opportunities — the record is a mirror the merchant can act on, never a judgment they must appeal.
- **Repair is visible.** A well-handled problem appears *in* the record ("issue resolved in 4h") rather than vanishing — because how a merchant repairs is the strongest trust evidence there is (§2.5).

### 9.2 Buyer trust — safety as the default state

The buyer-side promise: **"I feel safe buying here"** must be true *before the buyer thinks to ask*. Its components: secure payment rails and fraud protection that are platform facts, not merchant options; **verified-purchase reviews** (only buyers of the thing may review the thing — authenticity structural, not moderated-after); delivery estimates that are defended promises (§7); the return policy visible, human-readable, and consciously confirmed by the merchant (§4); proactive disclosure when anything goes wrong (§2.5); and **privacy in plain language** — what DOF knows and why, readable by a human, with the constitutional guarantee that one merchant's data never powers another's advantage (frozen isolation, §12) extended to buyers: their behavior is never sold, and personalization always cites its source ("because you follow Rosa's Ceramics").

The experience law: buyer trust is **ambient, not argumentative**. A page shouting "100% SAFE! GUARANTEED!" reads as a scam; a page that quietly answers arrival, return, authenticity, and who-is-this before they're asked reads as a good shop (UX-BIBLE-001 §3 renders this).

### 9.3 Community trust — authenticity over volume

The community (Sparks, reviews, videos, follows) is where trust compounds — and where it is attacked. Constitutional stances: **meaningful reputation** — standing in the community is earned through participation that helped someone (answers, honest reviews, welcomes), never through volume, streaks, or engagement farming; **anti-spam and anti-manipulation are product physics, not moderation chores** — review fraud, vote brigades, fake urgency, and astroturfing are attacks on the marketplace's operating system and are met with standing enforcement (Administration's frozen jurisdiction — Ignite informs, never punishes, Law respected from v1.0 §13); **moderation with dignity** — actions are explained, appealable, and audited (the kernel's audit discipline applied to community decisions); and **participation builds the record** — a merchant who shows up for others is visibly that kind of merchant, which braids Community Before Commerce into the Trust Fabric.

### 9.4 AI trust — never a black box

The merchant's trust in Ignite follows the same physics as every other trust on the platform: evidence, consistency, accountability, repair. Constitutionally: every recommendation answers the **explanation quartet** (§2.1); provenance makes "what did the AI touch" permanently answerable (Law 4); the Autonomy Ledger makes AI power *legible and revocable* — including Ignite's self-demotion after reversals (§2.4); AI mistakes get the same recovery discipline as everyone else's (§2.5) — self-reported, reverted, learned from; and the merchant remains in control at every setting, with R3 forever out of AI reach. An unexplainable recommendation is not shipped with a disclaimer; it is not shipped.

### 9.5 Trust signals — the philosophy

Across all four constituencies, signals obey six words: **verification, transparency, explainability, accountability, reliability, consistency.** In design terms: a signal must be *verifiable* (traceable to events, not asserted), *proportionate* (no signal louder than its evidence), *universal* (the same rules for every merchant — no signal is for sale), *durable* (records age gracefully; one bad month doesn't erase a good year, and the display favors trajectory over snapshot), and *repair-inclusive* (§9.1). Anything that fails these tests is trust theater and does not ship.

---

## 10. Signature Moments — Ignite as Witness

### 10.1 The architecture of noticing

DOF remembers everything (the event store) — Signature Moments are that memory, surfaced with taste. A moment is **derived from real events, never scheduled by marketing**: the hundredth order is detected the way a projection detects anything. Ignite maintains the **Moment Ledger** (§1.2) so every moment fires exactly once, at the right intensity, respecting quiet hours and never stacking. The emotional design of every moment — objective, feeling, timing, pacing, intensity — is law in UX-BIBLE-001 §14; this section defines the orchestration.

### 10.2 The moment taxonomy

Three intensities, budgeted (the full registry and intensity rules live in UX-BIBLE-001 §14):

- **Ceremonies** (full-screen, rare — a handful per merchant *lifetime*): launch, first sale, and little else. Protected: nothing interrupts them, and they interrupt nothing (they queue behind flow states).
- **Cards** (a warm moment in Pulse): first review, first repeat customer, revenue milestones, anniversaries, community milestones. One tap to share or dismiss; dismissal is memory (never re-shown).
- **Whispers** (a line in the digest, a subtle mark): streak-free progress notes, quiet trajectory observations. The default intensity — most achievement recognition belongs here.

Merchant journey moments (first store, first product, first Spark, first Deal, first Coupon, first follower, first order, first sale, first review, first repeat customer, revenue milestones, anniversaries) and community moments (trending Sparks, viral deals, helpful contributors, merchant recognition) are all mapped in the UX-BIBLE-001 §14 registry with per-moment emotional specifications. Customer moments (a great find, money saved over time, following, joining, supporting local) follow the same physics on the buyer side — always honest ("you've saved €84 with DOF deals this year" is real math or it doesn't render).

### 10.3 AI participation rules

Ignite participates as **a partner who was paying attention, never a hype machine**: it congratulates only with the evidence in hand (*"Your 100th order — a year ago this was one typed sentence. 61 of those orders came from repeat customers."*); it may attach **one** next-goal suggestion to a moment, as an ordinary proposal, never a demand (*"Want to thank them with a small coupon? I drafted one."*); it never converts a celebration into a sales pitch for DOF features; and it respects the persona and the moment (a restaurant's Friday-night rush is not the time for a card — timing is part of the design, UX-BIBLE-001 §14). Recognition without performance: no synthetic emotion, no exclamation inflation — warmth through specificity.

### 10.4 Recovery moments

The taxonomy explicitly includes the un-shiny milestones (specified with the same care in UX-BIBLE-001 §14): the comeback (returning after inactivity — greeted with what grew while they were away, never with guilt), the resilience marker (first fully-handled return, first recovered dispute — *"you kept a customer most shops would have lost"*), and the repaired launch (a flopped opening followed by a real first sale lands the first-sale ceremony *with its history acknowledged*). Celebrating resilience is how the platform says the quiet truth: every good business is a history of handled problems.

---

## 11. Merchant Personas

A persona is a **starting preset + a vocabulary skin — never a fork**. Same aggregates, same commands, same workspace skeleton (Platform Over Features); what varies is genesis defaults, initial reveals, labels, and which proposals fire first. Persona is inferred at genesis (declared confidence, changeable anytime), and drift is expected — the boutique that adds workshops becomes services+retail by *doing*, not by re-onboarding.

| Persona | Genesis preset & first reveals | Vocabulary skin | Signature early proposal |
|---|---|---|---|
| **Home entrepreneur** | S0 minimal; single location implicit; flat shipping | plain words, zero trade terms | "Your blanket got 40 views — a weekend deal?" |
| **Boutique retailer** | variants prominent (size/color), barcode early, seasonal collections | retail terms allowed when *they* use them first | "Import your Square catalog?" · lookbook collection |
| **Restaurant** | menu-shaped catalog (sections = collections), hours first-class, pickup windows; shipping *hidden* | "menu," "dishes," "orders tonight" | "86 the special?" (availability toggle) · photo-to-menu import |
| **Grocery** | high-count catalog, unit pricing (€/kg), fast repeat-purchase lists, inventory tracked from day one (the persona exception — need is certain) | "aisles," "restock" | supplier reorder autopilot offered earliest |
| **Service provider** | zero shipping/inventory; calendar & booking windows first-class; deposits | "appointments," "clients" | "Tuesdays are empty — an off-peak price?" |
| **Digital creator** | instant fulfillment, license text default, file delivery; no location at all | "downloads," "supporters" | "Bundle your 3 presets — bundles sell 2.4×" |
| **Event organizer** | date-bound products (tickets = variants with windows — the sale-window VO already exists), capacity = stock | "tickets," "attendees," "the door" | "Early-bird ends Friday — announce it?" |
| **Professional services** | proposals/engagements, retainer patterns, trust surface (credentials) early | "engagements," "clients" | "Turn your 3 most-asked questions into a services page" |
| **Multi-location business** | S3 partially pre-revealed (locations, staff, transfer), per-location Pulse | operational vocabulary accepted | "Store 2 sells out of X while Store 1 sits on 12 — transfer?" |

The skins are honest about the model beneath: a "dish" *is* a Product, a "ticket" *is* a variant with a sale window. Vocabulary is presentation; the domain stays singular. Where a persona exposes a genuine model gap (bookings, capacity-by-date), that is a **future domain** at a named seam — not an Ignite hack. Trust surfaces skin too: professional services lead with credentials, restaurants with hygiene and hours kept, boutiques with returns generosity — the same record (§9.1), rendered in the vocabulary buyers of that persona actually check.

---

## 12. 2035 — What Ignite Becomes

**The trajectory: assistant (2026) → operator (2029) → partner (2032+).** Today Ignite drafts and proposes. Mid-term, autonomy ledgers mature until routine operations run themselves under standing rules, and "run my store while I'm at the market" is a mode, not a metaphor. Long-term, Ignite is the merchant's **business partner**: it remembers every decision and outcome since genesis (the event store is its episodic memory — the deepest reason event sourcing was constitutional), it knows *why* the merchant is doing this (the genesis conversation, in their own words, is a permanent asset), and it defends their interests in an economy increasingly populated by machines.

That last clause is the 2035 bet: **agentic commerce.** Buyers will send agents ("find a handmade baby blanket under €40, arriving Friday"). Merchants who answer with static pages lose to merchants who answer with agents. Ignite becomes the merchant's negotiating agent — quoting, holding stock, bundling, applying standing rules within merchant-set bounds. The **Proposal Protocol is deliberately shaped to be externalizable** as that negotiation surface: a buyer-agent's offer is a proposal *from outside*, evaluated against the ledger exactly like Ignite's own drafts. We are already building the object model of machine-to-machine commerce; 2035 is when it gets a wire format. And when it does, **the Trust Fabric is what the agents negotiate over**: a machine-readable, event-verified track record (§9.1) is the merchant's collateral in agent-to-agent commerce — un-fakeable because it is derived from a decade of immutable events, not asserted. The marketplace whose trust records are *provable* wins the agentic era; we have been accumulating that proof since migration 0001.

**Rooms left in today's architecture (named now, built later):** versioned proposal schemas in `contracts/` from day one (a *published language*, per ADR-003 §4) · the Autonomy Ledger as an aggregate with audit history ("who allowed the AI what, when") · adapter registry with capability matrices (§5.1) open to third-party adapters, then to a **skills marketplace** (accountants, agencies, and vendors ship proposal-producers that plug into the same approval machinery — the OS metaphor completing itself, safely, because *the proposal layer is the sandbox*) · per-merchant AI policy isolation (a merchant's data never trains another's suggestions; a 2035 regulatory table-stake bought cheaply in 2026) · **trust-record projections designed for eventual third-party verifiability** (the agentic-era collateral, derivable on demand from the event history) · the Moment Ledger as the seed of a decade-long merchant memoir ("your first ten years") · portfolio orchestration (one Ignite across a person's several businesses — `StaffMembership.principal` typing already permits it) · and the Community flywheel: Ignite proposals that create *social* moments (launches, drops, milestones), because DOF's moat is that its commerce OS has a community attached, and Ignite is what braids them.

---

## 13. What Ignite Is NOT (boundary register)

- Not a data owner — no business truth, ever (§1.2 is exhaustive); trust facts included.
- Not a domain bypass — no write path except public command gates under a real membership.
- Not an enforcement actor — trust/standing/fraud enforcement is Administration + Merchant domain law; Ignite may *inform*, never punish.
- Not a judge of merchants — the track record (§9.1) is domain truth rendered honestly; Ignite coaches toward a better record, never scores, ranks, or sentences.
- Not a required path — every Ignite flow has a manual equivalent; the merchant who wants to do everything by hand loses nothing but time.
- Not a persona fork, a second product, or a "mode" — one platform, progressively revealed.
- Not a chatbot — chat is one door; the proposal is the product.
- Not a hype machine — moments are witnessed, not manufactured (§10.3); celebration is never an engagement tactic.

---

## 14. Success Metrics

Genesis: median ≤3½ min, p75 ≤5 (frozen) · **Time to First Deal** (constitutional north star) · proposal acceptance rate (health band, not maximization — 100% means Ignite proposes too timidly; below ~60% means it wastes attention) · reversal rate on auto-applied actions (<1%; the trust budget) · autonomy adoption depth (dials raised and *kept* raised — revocation is the loudest feedback we can collect) · reveal precision (revealed capabilities actually used within 30 days) · questions-per-merchant-lifetime (down and to the right: Never Ask Twice, measured) · import completion rate and time-to-landed-catalog · weekly digest open rate (do merchants *want* to read what their AI did?).

**Trust Fabric metrics (§9):** repeat-purchase rate (the truest buyer-trust number) · on-time fulfillment rate platform-wide · time-to-acknowledgment on trust-damaging events (§2.5 speed law) · recovery completion rate and post-recovery retention delta (does repaired trust actually retain?) · dispute rate and median resolution time · verified-purchase share of reviews (structural target: 100%) · buyer-reported purchase confidence ("felt safe") · merchant-reported platform confidence ("I feel confident running my business here").

**Signature Moment metrics (§10):** launch-card and milestone share rate (do merchants *want* to tell someone?) · day-2 return rate after genesis · comeback rate after inactivity outreach · moment dismissal rate (rising dismissals = celebration inflation; the §14 budget failed) — explicitly **not** engagement-time maximization, which is an anti-metric here.

---

## 15. Conflict & Reconciliation Register (frozen docs)

| # | Frozen material | Relationship | Resolution |
|---|---|---|---|
| 1 | ADR-001 §9 Ignite 1.0 flow | **Preserved whole** | Becomes the opening movement of Ignite 2.0; §3 extends entry (three doors) without altering steps, budget, or psychology |
| 2 | ADR-001 §13 "AI is staff, not magic" + §13.3 guardrails | **Inherited as ceiling** | Proposal Protocol is the generalization of §13.2's AI Jobs + draft approval; §13.3 maps to R3 (never autonomous) and the no-side-door law |
| 3 | ADR-001 §12.2 AI Assistant membership | **Reused** | Ignite executes under it; the Autonomy Ledger is the "per-merchant policy" that section anticipated |
| 4 | Scale Tiers Starter→Enterprise (ADR-001 §6, PRODUCT_TIER_LIMITS) | **Kept orthogonal** | Brief's Beginner→Enterprise ladder implemented as Surface Levels (§6), a separate axis; tiers keep gating entitlements only |
| 5 | ADR-001 §11 IA — Pulse and Assistant as siblings | **Soft amendment proposed** | One brain, two doors (§8); IA skeleton, nouns, and ordering unchanged. Flagged for ADR-001 v1.2 rather than silently absorbed |
| 6 | "Ignite owns no business data" (this brief) vs BLUEPRINT-001 `ignite_drafts` | **Clarified** | Orchestration state is Ignite's to own (§1.2); business truth is not. `ignite_drafts` was already correctly placed |
| 7 | ADR-002 catalog model (options as VOs, born-draft, readiness) | **Load-bearing reuse** | Genesis, imports, and templates land through the existing aggregate exactly as proven by the vertical slice (incl. D-31 SKU semantics) |
| 8 | ADR-003 five patterns, ownership matrix, ACL rule | **Obeyed structurally** | Ignite = P5 saga initiator + event consumer + query client; adapters live behind §6 ACLs; proposal schemas join the published language |
| 9 | ADR-004 data constitution | **Obeyed** | All Ignite tables manifest-first; cross-domain references by id value only; compensation not deletion |
| 10 | Brief asks for "product templates" configuration | **Reinterpreted** | Templates are persona preset data (pre-filled attribute sets + AI prompt seeds), not new schema — no new domain concepts required |
| 11 | ADR-001 §10 Trust & Verification (ladder, escrow, async verification) | **Preserved as mechanics; experienced through §9** | The Trust Fabric adds no trust states, no new verification levels, no scoring aggregate — it is the presentation and orchestration law over frozen mechanics. Track-record *display* reads existing domain events/projections |
| 12 | Administration owns enforcement (ADR-001 §12.2, ADR-003 matrix) | **Reaffirmed under amendment** | Anti-manipulation and fraud response (§9.3) route to Administration; Ignite detects and informs, never sanctions |
| 13 | Commerce owns escrow/payments facts (ADR-001 §10) | **Reused as buyer-trust substrate** | §9.2's "platform-vouched cold start" is the existing escrow mechanic, narrated — no new money mechanics |
| 14 | UX-BIBLE-001 (co-amended v1.1) | **Paired document** | Emotional/sensory law of the Trust Fabric and Signature Moments lives there (§3, §14); orchestration law lives here. Neither contradicts the other's registers |

## 16. Decision Register

**I-1** Ignite is an orchestration domain owning orchestration state only; five laws (§1.3) are constitutional. **I-2** The Proposal is the unit of intelligence: typed, evidence-bearing, schema-validated, previewable, expiring, provenance-carrying. **I-3** Reversibility classes R0–R3 govern autonomy; R3 is the frozen ceiling. **I-4** Approval is ceremonial (Moment / Bundle / Standing Rule); dialog-per-action is forbidden. **I-5** The Autonomy Ledger implements graduated, evidence-earned, always-revocable AI trust — symmetric with merchant Progressive Trust. **I-6** Genesis gains three doors; the frozen three questions and time budget are untouched. **I-7** Store genesis lands as one Reveal bundle; legal text follows the two-step (visible → binding) pattern. **I-8** Imports are Source Adapters + Dossiers; land as born-draft products with field provenance and batch compensation; move-vs-mirror is a ledger rule. **I-9** Surface Levels are a fourth merchant axis — presentation, not entitlement; reveals are event-triggered, budgeted, and de-escalate. **I-10** Operations arrive as Pulse tasks; modules are secondary. **I-11** One Copilot brain, two doors (feed + chat); grounding rules constitutional. **I-12** Personas are presets + vocabulary skins, never forks; genuine model gaps become future domains at named seams. **I-13** New principles adopted: Reversible Over Confirmed · Never Ask Twice · Show the Work; Progressive Complexity declared bidirectional. **I-14** The Proposal Protocol is designed for eventual externalization (agentic commerce, skills marketplace) — versioned in `contracts/` from first implementation.

*Added by AMENDMENT-001:* **I-15** Every interaction builds, maintains, or restores trust; the Trust Fabric (§9) is the experience law over frozen trust mechanics — signals are records not scores, earned never purchased, verifiable never asserted, universal never for sale. **I-16** Trust Recovery is a first-class product experience: Recovery Journeys (§2.5) with the four laws (speed beats polish · disclosure beats discovery · merchant stays the author · repair ends with prevention); engineering failure for recovery theater is a firing offense. **I-17** Proposal anatomy gains *Assumptions*; the explanation quartet (why · evidence · confidence · assumptions) is mandatory for every recommendation — an unexplainable recommendation does not ship. Ignite self-demotes autonomy on reversal and self-reports its own mistakes. **I-18** Signature Moments are event-derived, never manufactured; three intensities (Ceremony/Card/Whisper) under the UX-BIBLE-001 §14 budget; the Moment Ledger guarantees once-only firing; AI participation is witness-with-evidence plus at most one next-goal proposal — celebration is never an engagement tactic. **I-19** Imported reputation is displayed and attributed, never blended into DOF trust records; DOF trust is earned on DOF. **I-20** Trust records are designed for eventual third-party verifiability — the agentic-commerce collateral of 2035.

---

*Ignite 2.0 in one sentence: every other platform gives merchants an admin panel and wishes them luck; DOF gives them a partner that drafts, proves, asks once, remembers forever, notices what they achieved, helps them repair what goes wrong — and can always be overruled.*
