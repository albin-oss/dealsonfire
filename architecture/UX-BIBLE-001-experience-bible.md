# DOF Platform — UX-BIBLE-001

# The DOF Experience Bible

**Status:** Accepted (constitutional) · **Version:** 1.1 · **Date:** 2026-07-05
**Authors:** CXO / Chief Product Designer / Chief Trust Officer / Principal UX Architect (one pen)
**Binding docs honored:** ADR-001 v1.1 (genesis flow §9, workspace IA §11, AI-as-staff §13, trust ladder §10), ADR-002, ADR-005 v1.1 (Proposal Protocol, ceremonies, Autonomy Ledger, Surface Levels, persona skins, Trust Fabric, Signature Moments — co-amended), DECISIONS.md. This document adds no mechanics; it is the law of how the frozen mechanics must *feel*. Conflicts: none found; reinforcements noted inline.

**v1.1 amendment (AMENDMENT-001):** integrated the **Marketplace Trust Experience** (the Trust Fabric §3, the twin promises §1.5, trust-repair choreography §3.6, principle #13) and **DOF Signature Moments** (§14 expanded from the delight registry into the full Signature Moments system with per-moment emotional design). Sections renumbered from v1.0: Cognitive Load §3→§4 and all subsequent sections shifted by one; Delight §13 became Signature Moments §14.

**Scope:** every screen, interaction, workflow, animation, notification, empty state, error, and AI utterance shipped under the DOF name. When a future design decision is ambiguous, this document is the tiebreaker.

---

## 0. Challenges to the Brief (Read First)

**0.1 "How should DOF feel?" has a one-answer trap.** Most experience bibles pick a single feeling ("delightful!") and apply it uniformly, which is how you get confetti on a refund screen. Feelings must be *situational*: the right feeling during genesis (momentum) is wrong during a return dispute (steadiness). This bible therefore defines an **emotional palette with placement rules** (§1), not a mood.

**0.2 Delight is not a section — it's a budget, and its unit is the Signature Moment.** Delight spends attention, and attention is the merchant's scarcest resource. We define a *registry of earned moments* with strict rarity rules and, for every moment, a full emotional specification — objective, feeling, timing, pacing, intensity (§14). A platform that celebrates everything celebrates nothing; a platform that celebrates the *right* thing at the right intensity becomes part of the merchant's own story.

**0.3 One principle in circulation needs demotion and one needs promotion.** "Beautiful by Default" is often read as *decoration* by default; we sharpen it to **"the default is designer-grade, and the merchant's brand — not ours — is the hero"** (§11). And we promote a principle the platform has been living without naming: **Calm is a feature.** DOF's competitors monetize anxiety (badges, streaks, urgency). We take the opposite bet: the merchant who feels calm runs a better business and stays a decade. Calm Technology is hereby constitutional (§1.3).

**0.4 Trust is not a screen element. Trust is the substrate every feeling stands on.** Badges, stars, and checkmarks are how the industry *decorates* trust; they are not how trust works. Trust is the invisible operating system of the marketplace: **every interaction either builds it, maintains it, or restores it — there is no trust-neutral interaction.** No emotion in the palette (§1.2) is achievable on a substrate of doubt: pride curdles into suspicion, calm into complacency-anxiety, hope into hype. This bible therefore treats safety as the precondition feeling (§3), designs the *experience* of the frozen trust mechanics (ADR-001 §10; ADR-005 §9 holds the orchestration law), and elevates **trust repair to a defining product experience** (§3.6) — because the moment something goes wrong is the moment a buyer or merchant actually learns who we are.

---

## 1. Cover — How DOF Should Feel

### 1.1 The one sentence

**DOF feels like a capable friend who already set the table** — warm on arrival, precise underneath, quiet until useful, and always on the merchant's side.

Two textures fused: *warmth* (Airbnb's welcome, a bazaar's hum) and *precision* (Stripe's rigor, Linear's speed). Warmth without precision is a craft fair that loses your money; precision without warmth is enterprise software. DOF is **warm precision**.

### 1.2 The emotional palette (merchants)

| Emotion | Where it is designed to occur | Never at the cost of |
|---|---|---|
| **Momentum** | genesis, first product, imports landing | accuracy |
| **Pride** | the Mirror, the Launch, first sale, milestones (§14) | honesty (no fake stats) |
| **Calm** | everyday operations, Pulse, settings | urgency that is *real* |
| **Confidence** | approvals, money screens, policies | comprehension (never confident-and-confused) |
| **Safety** | errors, undo, anything reversible — and the marketplace itself (§3) | agency (safety ≠ handholding) |
| **Hope** | insights, opportunities, tier promotion | truth (never manufactured optimism) |

Safety is the palette's **substrate emotion** (§0.4): it is the one feeling that must be present *underneath* whichever feeling a surface is designed for. The forbidden emotions — the ones DOF must never *cause*: dread (opening the app to a wall of red), guilt (streaks broken by a vacation — vacation is a feature, ADR-001 §7), inadequacy (grades, scores framed as judgment), and suspicion (what is this platform doing behind my back?).

### 1.3 Calm is a feature (constitutional)

The merchant's phone already screams. DOF whispers, accurately. Concretely: notifications are consolidated and ranked, never streamed; nothing pulses, bounces, or badges without a real deadline; "attention needed" is a *short* list because triage happened before render (frozen Pulse ordering: attention → opportunities → how you're doing); and silence is a designed state — a quiet Pulse on a slow Tuesday says *"Nothing needs you. Enjoy the day."* rather than inventing engagement.

### 1.4 How customers should experience DOF

Customers feel **a marketplace of people, not a warehouse of SKUs**: stores that look like their owners (BrandKit is the hero), deals that feel like finds rather than manipulations, and community moments (launches, Sparks) that make buying feel like joining. The customer-side promise mirrors the merchant-side one: no dark patterns ever (§15) — because every customer is a future merchant (Opportunity First), and trust is the only acquisition channel that compounds.

### 1.5 The twin promises

Every design decision on DOF ultimately serves two sentences, and both must be *felt* rather than claimed:

> Buyers: **"I feel safe buying here."**
> Merchants: **"I feel confident running my business here."**

The twin promises are the bible's acceptance test. A surface, flow, or feature that makes either sentence less true does not ship, whatever else it optimizes — and the two are one system: buyers feel safe because merchants are confident and well-equipped; merchants are confident because the platform brings them buyers who trust it. The Trust Fabric (§3) is how the promises are kept; the Signature Moments (§14) are how keeping them is *felt over time*.

---

## 2. Experience Principles

The constitutional set, consolidated from ADR-001/005 and completed here:

1. **Opportunity First** — every surface leads with what the merchant *could do*, not what they must fix.
2. **Grandma Test** — if a first-time founder can't use it unaided, it doesn't ship. Plain language is a load-bearing wall, not a copy style.
3. **Progressive Complexity (bidirectional)** — interface appears when useful, retreats when unused (ADR-005 §6).
4. **Invisible Complexity** — the machine is intricate; the experience never is. Complexity may be *discoverable*, never *ambient*.
5. **Beautiful by Default, Merchant as Hero** — defaults are designer-grade; DOF's chrome recedes so the merchant's brand and products take the stage (§11).
6. **AI-First, Human-Controlled** — intelligence drafts; humans decide; provenance forever (ADR-001 §13, ADR-005 §2).
7. **Trust Before Growth** — applies to the platform, the merchant, *and the AI* (Autonomy Ledger).
8. **Never Ask Twice** — a fact expressed once is remembered forever; re-asking is a defect (ADR-005).
9. **Show the Work** — every claim cites evidence in merchant language; confidence without evidence is forbidden output (ADR-005).
10. **Reversible Over Confirmed** — prefer apply+undo to ask-first wherever cheap to reverse; confirmation is reserved for the genuinely consequential (ADR-005; R-classes).
11. **Calm is a Feature** — new, §1.3. DOF never monetizes anxiety.
12. **Errors Educate** — every rejection teaches the next step, in the merchant's words (constitutionalized from D-31's practice: *"This product has no options yet — add one, for example Size or Color…"*).
13. **Every Interaction Moves Trust** — new, §0.4/§3. Build, maintain, or restore: every surface must know which of the three it is doing, and repair is designed with more care than success (§3.6). Trust is earned, never purchased; signaled by records, never by theater.

Challenge outcome: no listed principle was removed; #11, #12, and #13 were added; #3, #5, #10 sharpened as noted.

---

## 3. The Trust Fabric — How Safety Feels

The mechanics of trust are frozen elsewhere (ADR-001 §10: the verification ladder, standing, escrow; ADR-005 §9: the orchestration law). This section is the **feelings layer**: how trust behaves as an experience for buyers, merchants, the community, and the AI. The design instruction that governs everything below: **trust is ambient, not argumentative** — a page shouting "100% SAFE! GUARANTEED!" reads as a scam; a page that quietly answers every doubt before it's voiced reads as a good shop.

### 3.1 Buyer trust — answered before asked

Every buying surface must answer four questions *before the buyer thinks to ask them*: **Will it arrive?** (a delivery estimate that is a defended promise, not marketing — ADR-005 §7), **Can I change my mind?** (the return policy visible, human-readable, merchant-confirmed), **Is this real?** (verified-purchase reviews — only buyers of the thing may review the thing, authenticity structural, not moderated-after), and **Who is this?** (the merchant's track record, §3.2, one tap away). Payment security and fraud protection are *platform facts* signaled quietly — present like a building's foundations, never like a banner. Privacy is plain language: what DOF knows, why, and the standing guarantee that buyer behavior is never sold and personalization always cites its source ("because you follow Rosa's Ceramics"). The feeling to achieve: the safety you feel in a well-run shop — not because anyone said "trust us," but because everything you checked, checked out.

### 3.2 Merchant trust — a record, not a rating

A merchant's trustworthiness renders as a **track record**: verification, longevity, orders fulfilled, on-time rate, satisfaction, responsiveness — **evidence, not adjectives**, every item explorable to its source (Show the Work applied to reputation). Design laws: records read like *references, not game profiles* (no points, levels, or leaderboards — anti-gamification is constitutional); records are built from ordinary good work, so there is nothing to farm; **new is not suspicious** — a day-one merchant displays "New store · payments protected by DOF" with dignity, the platform vouching while the record is short (frozen escrow, narrated); trajectory beats snapshot (one bad month doesn't erase a good year); and **repair appears in the record** ("issue resolved in 4h") because how a merchant fixes things is the strongest evidence there is. For the merchant themselves, the record is a mirror with a coach attached — Ignite proposes what would improve it, and it is never rendered as a grade to feel bad about.

### 3.3 Community trust — authenticity over volume

Reputation in the community is earned by *having helped* — honest reviews, useful answers, generous welcomes — never by volume, streaks, or engagement. Anti-spam and anti-manipulation are experience physics: manufactured urgency, brigades, astroturf, and fake scarcity are attacks on the marketplace's operating system, met with enforcement (Administration's jurisdiction) and — this is the design half — **made unrewarding by construction**: nothing in DOF's ranking or display amplifies raw volume, so shouting buys nothing. Moderation happens with dignity: explained, appealable, audited. The feeling: a moderated town square that doesn't feel policed — because the architecture, not the police, does most of the work.

### 3.4 AI trust — the glass engine

Ignite is never a black box, and the *feeling* of that is designed: every recommendation visibly answers the **explanation quartet** — *why · on what evidence · how confident · assuming what* (ADR-005 §2.1) — with the assumptions stated in plain sight, because an unstated assumption is where trust in a machine dies. The Autonomy Ledger renders AI power as something the merchant can *see and set*, like thermostat markings; Ignite's **self-demotion after a reversal** (ADR-005 §2.4) is shown, not hidden — *"You undid two of my changes; I've gone back to asking first"* — the single most trust-building sentence an AI can say. AI mistakes are self-reported and repaired in the open (§3.6). The merchant must always feel: *I know what it did, I know why, and I can take the keys back anytime.*

### 3.5 Trust signals — the rendering rules

Six words govern every signal: **verification, transparency, explainability, accountability, reliability, consistency.** Rendered: a signal must trace to real events (verifiable), never shout louder than its evidence (proportionate), follow the same rules for everyone (universal — no signal is for sale, ever), age gracefully (durable), and include repair history (§3.2). Visual grammar: trust signals are *quiet, factual, and load-bearing* — set in the interface's calm voice, never in promotional dress. Anything failing these tests is trust theater and does not ship.

### 3.6 Trust repair — the defining experience

**The moment trust is tested is the moment it is actually manufactured.** DOF's repair choreography — for merchant mistakes, delivery issues, disputes, inventory errors, shipping failures, and Ignite's own errors (orchestration in ADR-005 §2.5) — has one feel: **own it fast, fix it visibly, follow through.**

- **Speed over polish:** acknowledgment lands within the hurt party's attention window; a fast honest "we know, we're on it" outperforms a slow perfect answer.
- **Disclosure over discovery:** bad news travels *from* us — the buyer hears about the delay before they ask; the merchant hears about DOF's own failure from DOF, plainly ("our fault; here's what happened and what we changed"). Status honesty is a brand surface.
- **The fair judge:** disputes render with evidence assembled for both sides and options with consequences explained — steadiness, never blame, on either party. The buyer and the merchant should both leave a dispute feeling *heard*, whatever the outcome.
- **Repair ends forward:** every recovery closes with the prevention step, so the ending feeling is "this is now less likely," not "that was bad."
- **The emotional arc:** a repaired failure should end *warmer* than an untested transaction — the service-recovery paradox treated as an observation about good conduct, never as a strategy (engineering failure for recovery theater is a firing offense, §15).

---

## 4. Cognitive Load

### 4.1 The disclosure ladder

Every piece of information earns its altitude. Four rungs, strictly ordered:

**Glance** (zero reading: state via position, color, count — "3 orders need packing") → **Read** (one sentence, merchant language) → **Expand** (the details, one tap away) → **Inspect** (full history, provenance, raw values — for the merchant who wants the machine room; it exists, it's just never the front door).

Design rule: *nothing may demand a lower rung's attention with a higher rung's content.* A glance element that requires reading is a defect; a modal that could have been a toast is a defect.

### 4.2 Budgets (hard limits, reviewed not exceeded)

- **One primary action per screen.** There may be many *possible* actions; only one is visually primary.
- **Five top-level nouns at Surface 0** (frozen IA); each Surface Level's noun budget is a launch gate, not a guideline.
- **Three facts per card.** A card that needs a fourth fact is two cards or one Expand.
- **Seven words** target for any button, toast, or glance sentence.
- **Zero required fields** beyond the constitutionally irreplaceable questions (ADR-001 §9): everything else is pre-filled, editable, or deferred.

### 4.3 Numbers policy

Money renders as money (€1,240 — never 124000 minor units, never 1240.00 when cents are zero); trends render as sentences before charts ("Twice your usual Tuesday"); precision follows stakes (analytics may round; anything the merchant *signs* — payouts, prices, fees — is exact to the cent). Charts appear at the Read rung or lower, never at Glance. Trust numbers follow the strictest tier: a track-record figure (§3.2) is exact and sourced, because a rounded reputation is a false one.

---

## 5. Navigation Philosophy

### 5.1 Three moves, fixed ground

Any routine task is reachable in **≤3 moves from Pulse** (move = tap/click/keystroke-chord). Navigation order is *fixed* — spatial memory beats contextual reshuffling (frozen, ADR-001 §11); capability-gated items appear and retreat by Surface Level, but never reorder.

### 5.2 The two travel modes

- **Walking** — the merchant browses the fixed structure. For orientation, learning, and control. Navigation chrome fully visible.
- **Being driven** — the merchant expresses intent (tap a Pulse task, ask the Copilot, accept a proposal) and lands *on the completed or nearly-completed thing*, with undo, not on a form. AI takes over navigation exactly when intent is unambiguous — and the destination always shows *where you are* so being driven still teaches the map.

The ask bar (Copilot's door) is the universal shortcut: type or say the thing; Ignite either does it (within autonomy), proposes it, or walks you there. Power users get the same bar as a command palette — the Grandma path and the Linear path are one path with two dialects.

### 5.3 When navigation disappears

During **ceremonies** (Mirror, Reveal, Launch, first-sale moment) and **runs** (packing a batch of orders, reviewing an import): full-screen focus, chrome gone, one clearly-marked exit that always preserves progress. Flow states are sacred; nothing interrupts a run — not even good news. It queues.

### 5.4 Back is safe, always

The back gesture/button never loses work (drafts persist — frozen), never re-asks, never double-submits (idempotency is a UX feature the platform already guarantees), and never traps (no modal stacks — §15).

---

## 6. Motion System

### 6.1 Motion is meaning

Every animation must do one of four jobs — **orient** (where did this come from/go), **connect cause to effect** (you did this, therefore that), **report status** (working, done, failed), or **celebrate** (rare, §14). Motion that does none of these is decoration and does not ship. Motion never blocks input; the merchant can always act *through* an animation.

### 6.2 Tempo

| Band | Duration | Used for |
|---|---|---|
| Instant | ≤100ms | state flips, toggles, hovers — perceived as "the machine is me" |
| Quick | 150–250ms | transitions, reveals, card movement — the default band |
| Deliberate | 300–450ms | ceremonies' staging, sheet entrances |
| Celebration | ≤1200ms, skippable | the Signature Moment registry only (§14), intensity per its tier |

Physics over easing-drama: things arrive like objects with small mass — settled, no bounce, no elastic overshoot. DOF motion is *composed*, the way a good waiter moves.

### 6.3 Honesty about time (loading philosophy)

- **≤400ms:** show nothing. Spinners for sub-second waits *create* the feeling of slowness.
- **≤3s:** skeletons — only where real structure is known (a product grid skeleton mirrors the grid; never generic shimmer soup). Skeletons never lie about layout.
- **>3s (work):** narrated progress in merchant language — *"Reading your Etsy shop… found 34 products… drafting descriptions…"* Work the merchant understands feels half as long, and narration is Show the Work applied to latency.
- **AI generation streams.** Drafts appear as they form; watching the machine write *for you* is the product demo that never ends.
- **Optimistic by default** for R0/R1 actions (Reversible Over Confirmed applied to latency): the UI assumes success, reconciles on failure with an apologetic, specific toast and automatic restoration.

### 6.4 State vocabulary

- **Empty states teach the opportunity** (frozen, ADR-001 §11): what this space becomes, why it's worth it, one button that starts it — with the effort named ("Start one in 30 seconds"). An empty state is a doorway, never an apology.
- **Success states are proportional.** Routine success is quiet (a settle, a check, a soft haptic). Rare success is ceremonial (§14). Success copy states *what is now true* ("Live on your store") not "Operation completed successfully."
- **Failure states follow Errors Educate:** what happened (plainly) → what it means for the merchant → the next step, pre-filled where possible → and blame the system, never the person ("We couldn't reach Etsy" — not "Invalid credentials"). Every failure with a retry path *carries* the retry. Nothing is ever red-with-a-stack-trace; the machine room (Inspect rung) holds the details for those who ask. Failures that touch a customer relationship escalate into the repair choreography (§3.6) — the error state is then not an endpoint but the first beat of a Recovery Journey.
- **Waiting states carry undo.** Anything queued/optimistic shows its undo window as the primary affordance, not a footnote.

---

## 7. AI Experience — How Ignite Feels

### 7.1 Presence, not personality

Ignite has **no avatar, no name-cuteness, no synthetic emotions**. It is a presence with a voice — like a great concierge: you remember the competence, not the face. Its voice: first person, plain, brief; evidence attached; assumptions stated; certainty calibrated ("I'd start at €32 — similar blankets sell for €25–40" vs "You'll have real data after ~20 orders — until then this is a guess"); zero exclamation-point enthusiasm; and it *never* pretends emotions ("I'm excited!") — warmth comes from usefulness, manners, and *specificity* (§14.5), not simulation.

### 7.2 When Ignite speaks — and the deeper law, when it stays silent

Speaks: when asked; when a proposal crosses the usefulness bar (evidence-backed, actionable, timely); once per idea (a dismissed suggestion is dead — Never Ask Twice applies to suggestions); when it made a mistake (self-report is mandatory, §3.4); when a real milestone deserves witnessing (§14, at registry intensity only); and in the weekly digest ("What I did, what I noticed, what I'd do next").

Silent: during flow states and ceremonies (it queues); on customer-facing surfaces (Ignite is the merchant's staff — customers never see it); when confidence is low and stakes are high (silence over noise, always); when the merchant is grieving a failure (a bounced launch day gets steadiness, not suggestions — recovery has its own tempo, §14.4); and *by default* — the baseline state of Ignite is quiet. An AI that talks all day is a colleague nobody wants.

### 7.3 How proposals feel

Like **a note from a sharp colleague left on your desk**: headline in your language, the evidence right there, the assumptions owned, the after-state previewed (you approve *outcomes*, never command lists — ADR-005 §2), effort and reversibility visible ("takes effect immediately · undoable anytime"). Proposals wait politely in Pulse; they never modal, never badge-pulse, and they expire gracefully ("This one's out of date — the weekend passed. Dismissed it for you.").

### 7.4 How approvals feel

Like **signing, not clicking through**. The approval affordance is unhurried and singular — one clear act, visually distinct from all other buttons, never placed where muscle memory lands, never pre-focused for the Enter key on R2. Bundles (the Reveal, import landings, recovery journeys) feel like *unveiling*: here is the whole, inspect any part, exclude any part, one signature covers it. And the moment after approval always shows the thing itself, changed — cause, meet effect.

Declining is designed with equal care: "Not now" and "Not ever" are both one tap, both consequence-free, and both teach the Ledger. A merchant must never approve out of politeness or fatigue — fatigue-approval is counterfeit trust, and the Autonomy Ledger's integrity depends on every yes being real.

---

## 8. Store Creation — The Emotional Score

The frozen mechanics (ADR-001 §9) get their emotional notation. Six moments, each with a designed feeling and a designed *pause*:

1. **The Invitation** — *feeling: recognition.* "Turn this into a business" appears where their momentum already is. It must feel like being noticed, not targeted.
2. **The Conversation** — *feeling: competence.* One warm question they are guaranteed to answer well, in their own words. Big type, voice welcome, zero chrome. The interface should feel like leaning in.
3. **The Mirror** — *feeling: pride, with a lump in the throat.* Their idea returned as a real, named, branded thing. **Design the pause:** the preview settles in deliberately (§6.2 Deliberate band), then silence — no button nagging, let them look. This is the moment they screenshot. Choice-of-three preserves authorship: they *pick* their business, they aren't assigned one.
4. **The First Thing** — *feeling: relief.* The scary parts (writing, pricing) arrive pre-done with reasoning. The price suggestion must read as a friend's advice, not an algorithm's verdict.
5. **The Claim** — *feeling: ownership.* "Your store is ready. Claim it." Registration reframed as protecting something that already exists. Never a form-wall; one-tap identity.
6. **The Launch** — *feeling: an event.* Full ceremony (§14): the storefront revealed as customers will see it, one button, then celebration + the shareable launch card. The merchant should want to tell someone tonight. The Community echo (welcome Spark, first followers — frozen) is the afterglow that makes day two exist.

Under the whole score runs the trust substrate (§0.4): the new store is **born trustworthy** — honest default policies, platform-protected payments, the "new store, vouched by DOF" framing (ADR-005 §3.3) — so pride at the Mirror never has to survive a later discovery that the foundations were theater.

And the seventh moment nobody designs: **the return.** Day-two arrival lands on a Pulse that remembers everything, greets progress made ("Your store had 12 visitors overnight"), and offers exactly one next step. The distance between launch-high and day-two silence is where platforms die.

---

## 9. Community Experience — One Braid

Commerce and community are not two tabs; they are **one braid: every commerce act can be a story, every story can carry commerce.**

- **Stores** are characters — they have voices (BrandKit), moments (launches, milestones — §14), and followings. Following a store must feel like following a *person you're rooting for*.
- **Sparks** (community conversations — reserved brand language, frozen) are where stories live: a launch seeds a welcome Spark; a drop seeds anticipation; a milestone seeds congratulations. Sparks touching a product carry a quiet, honest tap-through — commerce present, never pushy.
- **Deals** — DOF's namesake — must feel like *finds*, generosity with a clock that tells the truth. A deal ending Sunday ends Sunday. Manufactured scarcity is a firing offense (§15).
- **Coupons** feel like *gifts with your name on them* — personal, redeemable in one tap, never a code-copying scavenger hunt.
- **Videos** are stalls, not billboards: the merchant showing the thing, tappable to the thing. Native, lightweight, honest.
- **Discovery** is people-first: browse *makers and moments*, not grids of SKUs. The unit of discovery is a store-with-a-story; search finds products, but *wandering* finds merchants. The customer feeling: a Saturday market, not a warehouse aisle.

The connective rule: **every surface can carry every other surface's objects politely.** A deal can live in a Spark, a video on a product, a launch in the feed — one object model (the platform already guarantees this), one visual grammar, zero jarring context switches.

The braid is also where community trust (§3.3) is felt: reviews sit under verified-purchase marks; helpful contributors are *recognized, not scored* (§14.3); reputation reads as history, not points; and nothing in the feed's mechanics rewards shouting — so the square stays worth standing in.

---

## 10. Commerce Experience — Effortless Operations

The frozen law (ADR-005 §7): **operations arrive as tasks, not modules.** The feelings layer:

- **Products** should feel like *show and tell*: camera-first creation, AI drafting the boring parts, the merchant polishing the parts they care about. Editing happens where looking happens — inline, on the thing, never in a distant form. Growth moments (first variant — the options journey D-31 made teachable) feel like the product *growing up*, not schema work.
- **Inventory** should feel like *glancing at the shelf*: counts where the products are; adjustments as one-line stories ("−2, damaged"); tracking itself optional until it earns its keep. The merchant never meets the word "stock ledger."
- **Orders** should feel like *a short to-do list with money attached*: needs-action first (frozen), each order a card with everything needed to act, batch actions appearing only when volume makes them kind. Packing a batch is a *run* (§5.3) — focused, rhythmic, satisfying, with a soft tally at the end ("6 packed · nice work").
- **Shipping** should feel like *a solved problem*: outcomes tuned ("free over €50"), tables maintained by Ignite, labels one tap. The merchant thinks about *promises to customers*, never about zones — and the dates shown to buyers are promises DOF helps keep (§3.1), with proactive disclosure the moment one is at risk (§3.6).
- **Returns** should feel like *being a fair judge with a good clerk*: each return a decision card with the evidence assembled and the cost math both ways; policy the safety net, patterns surfaced gently ("all three said 'smaller than expected' — reshoot the photo?"). Returns are the trust-building moment with a customer (§3.6), and the interface frames them that way — never as leakage.

Across all of it: idempotent, undoable, resumable — the platform's engineering guarantees surfaced as the *feeling of sturdiness*. Nothing double-fires, nothing is lost by a dropped connection, and the merchant can feel that without being told. Sturdiness is trust's quietest signal (§3.5): a platform that never loses your work is believed about everything else.

---

## 11. Visual Philosophy

**The merchant's brand is the hero; DOF is the gallery.** Storefronts look like their owners — DOF chrome on customer surfaces approaches zero. In the workspace, DOF's own voice is **warm neutral + one living accent**: generous light, real photography given the stage, typography doing the hierarchy (not boxes and rules), and the ember/fire motif reserved exclusively for *heat* — deals, launches, milestones. Fire everywhere is noise; fire rarely is identity.

What makes DOF recognizable at a glance is not a color — it is **conduct**: the calm density (space around things that matter), sentences where others put dashboards, evidence where others put badges, the single primary action, and motion that settles like a well-set table. You recognize DOF the way you recognize a well-run shop: nothing shouts, everything is where your hand goes. Trust signals share this dress code (§3.5): set quietly in the interface's own voice, factual, load-bearing — never promotional stickers.

Two structural rules: **depth is honest** (elevation means interactivity or focus, never decoration) and **the interface ages gracefully** (dense data views earn density at higher Surface Levels without ever changing the grammar — an S3 workspace is *more* DOF, not different DOF).

---

## 12. Mobile Philosophy

Mobile is not the small version; **mobile is the native habitat of our merchant** — the kitchen table, the market stall, the sofa at 11pm.

- **The camera is the primary input device.** Products begin as photos; barcodes scan; returns arrive with pictures. Any flow that can start with the camera, does.
- **Design for the 90-second burst.** Merchant sessions are interruptions between real life. Every flow is resumable mid-step (drafts persist — frozen), every list is triaged for "what can I clear in a minute," and nothing important requires a long session on a phone.
- **One thumb.** Primary actions live in reach; destructive ones don't. Gestures duplicate, never replace, visible affordances (Grandma Test).
- **Haptics are the quiet confirmation channel:** a soft tick for done, a distinct signature for *money arrived* — the first-sale buzz in the pocket is a designed moment (§14).
- **Desktop is the workbench** — imports, bulk edits, policy review, deep analytics land naturally there; the phone never blocks them, the desktop never hides the feed. Same brain, same objects, different posture.
- **Offline is a state, not an error:** reads persist, queued actions declare themselves ("will send when you're back"), and nothing composed is ever lost to a tunnel.

---

## 13. Accessibility Philosophy

**Accessibility is the Grandma Test taken literally, and it is constitutional, not a compliance checkbox.**

- **Plain language is accessibility.** Reading level targets are enforced in copy review; jargon is a defect class. This is the same law that makes errors educate.
- **Every sense has a first-class path.** Screen-reader narration is written as *narrative*, not generated label soup — the Pulse reads like a briefing ("Three things need you. First: two orders to pack…"). Voice input is native (genesis already accepts it — frozen). Haptic and visual channels always duplicate audio cues.
- **Reduced motion has full parity:** every meaning carried by motion (§6.1's four jobs) has a motionless equivalent; celebrations become still, warm cards. No one gets a lesser ceremony.
- **Floors, not targets:** contrast, touch-target size, focus visibility, and full keyboard operability are launch gates. The command bar (§5.2) doubles as the universal keyboard path to everything.
- **The AI is an accessibility technology.** For merchants with dyslexia, motor limitations, or low literacy, "say it and Ignite drafts it" is not convenience — it is the ramp. Design Copilot flows knowing that for some merchants they are the *only* comfortable path, and keep evidence, assumptions, and previews screen-reader-complete.
- **Include the excluded by default:** color never carries meaning alone; time-based challenges have patient alternatives; localization and RTL are architectural assumptions, not retrofits.

The feeling to protect: **nobody using DOF should ever sense they are using the accommodation version.** There is one DOF, and it happens to work for everyone.

---

## 14. Signature Moments — The Earned-Moments System

Most software completes tasks. DOF *witnesses progress* — intentionally designed memorable experiences that reinforce achievement, confidence, and belonging. The rules come before the registry, because the rules are what keep moments meaningful:

### 14.1 The laws of the moment

Every Signature Moment must be **rare** (rarity is the ingredient — celebration inflation is measured and treated as a defect), **earned** (derived from real events — ADR-005 §10.1 — never scheduled by marketing, never gamified with points/streaks/badges), **personal** (their words, their products, their numbers), **skippable and never blocking**, **once-only** (the Moment Ledger guarantees it), and **well-timed** (quiet hours respected; never during a flow state or a customer-facing rush; moments queue). Notification restraint is absolute: a moment may *wait days* for the merchant's next natural visit rather than buzz a phone at dinner — only money and problems may interrupt.

### 14.2 Intensity tiers

| Tier | Form | Budget |
|---|---|---|
| **Ceremony** | full-screen, motion's Celebration band, haptic signature | a handful per merchant *lifetime* |
| **Card** | a warm card in Pulse, one tap to share or dismiss | a few per month at natural peaks |
| **Whisper** | a line in the digest, a subtle mark on the thing itself | the default — most recognition lives here |

### 14.3 The registry — with emotional specifications

Merchant journey:

| Moment | Emotional objective | Merchant feels | Timing & pacing | Tier |
|---|---|---|---|---|
| **First store (Mirror + Launch)** | identity shift: "I'm a founder" | pride, momentum | the Mirror's designed pause; Launch immediately on publish — this one never waits | Ceremony (frozen, §8) |
| **First product published** | proof of momentum | capability | inline, at the moment of publish; quiet because Launch is near | Whisper → Card if standalone |
| **First Spark · first Deal · first Coupon** | "I can do the growth things too" | adventurousness | on completion, once each; includes one evidence line on what usually happens next | Whisper |
| **First follower** | being seen | warmth | next visit ("Someone's rooting for you — say hi?") | Card |
| **First order / first sale** | **the** moment: it works, it's real | joy, validation, relief | *immediate*, full-screen, the actual item + real amount + customer's town; distinct pocket haptic; prompt to tell someone; outranks and queues everything else | Ceremony |
| **First review** | external voice arrives | pride (or steadiness — a bad first review routes to §14.4 with repair support, never a celebration misfire) | next visit | Card |
| **First repeat customer** | the deepest business validation: someone *came back* | belonging, confidence | next visit; names the customer relationship, offers one thank-them proposal | Card |
| **Revenue milestones** (first €100/€1k/€10k…) | tangible progress | accomplishment | at the merchant's next visit, exact numbers, their trajectory drawn | Card; Whisper as magnitudes repeat |
| **Store anniversary** | the long arc honored | sentimentality, resolve | on the date, warmest voice: day-one words → today's numbers | Card |
| **Community milestones** (first helpful answer, welcomed a newcomer) | generosity recognized | civic pride | in digest | Whisper |

Customer journey (buyer-side, same physics — always honest math):

| Moment | Emotional objective | Customer feels | Design |
|---|---|---|---|
| **Discovering a great deal** | the *find* | serendipity, cleverness | the deal presents as discovery, not push; truth-telling clock (§9) |
| **Money saved** | thrift affirmed | smart, valued | real cumulative math ("€84 saved this year"), shown at natural moments, never as engagement bait |
| **Following a favorite store** | joining a story | connection | the follow confirms with the *store's* voice, not DOF's |
| **Joining a community** | belonging | welcome | first Spark participation greeted by people (seeded by Community), not by system toasts |
| **Supporting local** | values enacted | quiet pride | provenance shown with the merchant's own story; never moralizing copy |

Community moments (trending Sparks, viral deals, helpful contributors, merchant recognition): celebrated **communally, with consent** — the merchant approves before their milestone becomes a public feed moment (R2: publishing is consequential). Recognition of contributors is specific and human ("Marta's sizing answer helped 40 people") — never leaderboards.

### 14.4 Recovery moments — celebrating resilience

The registry deliberately includes the un-shiny milestones, with their own tempo (steadiness first, warmth after):

- **The comeback** — returning after inactivity is greeted with what *grew* while they were away (followers, favorites — real numbers) and one small next step. Never guilt, never "we missed you!" theater.
- **The repaired launch** — a flopped opening followed by a real first sale still gets the first-sale Ceremony, with its history honored: *"It took three weeks longer than you hoped. It's real now."*
- **The resilience markers** — first well-handled return, first recovered dispute, first survived stockout: Whisper-tier notes that say the quiet truth — *"you kept a customer most shops would have lost."* Every good business is a history of handled problems, and DOF is the first platform that says so.
- **Trust restored** — the completion of a Recovery Journey (§3.6) closes with its prevention step and a steady acknowledgment, not confetti: repair earns *respect*, and the tone knows the difference.

### 14.5 Ignite's part

Ignite participates as **a partner who was paying attention, never a hype machine** (ADR-005 §10.3): congratulation always carries the evidence ("61 of your 100 orders were repeat customers"); at most one next-goal suggestion may ride along, as an ordinary skippable proposal; no synthetic emotion, no exclamation inflation — **warmth through specificity**; and never a feature pitch inside a celebration. The digest is where most witnessing lives, in Whisper form — a supportive partner's weekly letter, not a notification stream.

---

## 15. Anti-Patterns — What DOF Will Never Be

The permanent refusal list. These are firing-offense patterns, not style preferences:

1. **Never enterprise software** — no settings labyrinths, no admin-panel grayness, no "contact your administrator."
2. **Never a dashboard-first product** — no wall of metrics as a greeting; sentences before charts, opportunities before KPIs.
3. **Never dark patterns** — no fake countdowns or manufactured scarcity, no confirmshaming ("No thanks, I hate money"), no pre-checked upsells, no buried cancellation, no guilt copy. On merchant *or* customer surfaces.
4. **Never anxiety as engagement** — no streaks that punish vacations, no pulsing badges, no unread-count farming, no "your competitors are growing faster" fear-mongering.
5. **Never interrogate** — no unnecessary questions, no re-asking known facts, no forms where a default would do, no required fields beyond the constitutional three.
6. **Never expose complexity without cause** — no jargon (SKU, variant, fulfillment node) on first-run surfaces; the machine room exists but is never the front door.
7. **Never modal stacks, never focus theft** — one layer of interruption maximum, and only for genuine R2/R3 consequence.
8. **Never blame the user** — no "Invalid input," no error codes as messages, no dead ends without a next step.
9. **Never fake the AI** — no pretend emotions, no invented facts, no confidence without evidence, no unstated assumptions, no hiding what the AI touched (provenance is a right).
10. **Never noise as care** — no notification spam, no "We miss you!" mails, no celebration inflation (§14.1 is measured).
11. **Never creepy** — personalization cites its sources; nothing implies surveillance; a merchant's data never powers another merchant's advantage (ADR-005 isolation, frozen).
12. **Never lock-in theater** — export always works, sync is respectful (move-vs-mirror, frozen), leaving is dignified. Confidence, not captivity.
13. **Never sell trust** — no paid badges, no purchasable placement dressed as credibility, no tier that "boosts" reputation; trust signals are earned records or they are nothing (§3.5).
14. **Never counterfeit social proof** — no fake reviews, no inflated counters, no astroturfed praise, no blending imported ratings into DOF records; verified or absent.
15. **Never stage a failure** — the service-recovery paradox is an observation, not a playbook; engineering problems to perform rescues (or slow-walking fixes to dramatize repair) is the deepest possible betrayal of §0.4.

---

## 16. Decision Register

**X-1** DOF's feel is *warm precision*: capable-friend warmth over Stripe-grade rigor; the emotional palette (§1.2) is placed situationally, never uniformly — with safety as the substrate emotion beneath all of it. **X-2** Calm is a Feature, Errors Educate, and Every Interaction Moves Trust join the constitutional principles; Beautiful by Default is sharpened to Merchant-as-Hero. **X-3** Information lives on the four-rung disclosure ladder (Glance/Read/Expand/Inspect) with hard budgets: one primary action, five S0 nouns, three facts per card; trust numbers are always exact and sourced. **X-4** Navigation is fixed-ground walking plus intent-driven being-driven; ≤3 moves from Pulse; chrome disappears only in ceremonies and runs; back is always safe. **X-5** Motion must orient, connect, report, or celebrate — otherwise it doesn't ship; tempo bands per §6.2; optimistic UI for R0/R1; loading is narrated honesty; AI output streams. **X-6** Empty states teach, successes are proportional, failures educate and carry their retry — and customer-touching failures open Recovery Journeys. **X-7** Ignite is a presence, not a personality: calibrated, evidence-citing, assumption-stating, silent by default, one-shot suggestions, never on customer surfaces; approvals feel like signing; declining is consequence-free. **X-8** The genesis emotional score (§8) is binding, including the born-trustworthy substrate and the day-two return moment. **X-9** Commerce and community are one braid; deals tell the truth; discovery is people-first; the feed's mechanics never reward shouting. **X-10** Mobile is the native habitat: camera-first, 90-second bursts, one thumb, haptic money-moment, offline as a state. **X-11** Accessibility is constitutional: one DOF that works for everyone; the AI is a ramp; reduced motion gets full parity. **X-12** The twelve-plus-three anti-patterns (§15) are permanent refusals and override any future growth tactic that conflicts.

*Added by AMENDMENT-001:* **X-13** The twin promises (§1.5) — "I feel safe buying here" / "I feel confident running my business here" — are the bible's acceptance test; features that weaken either do not ship. **X-14** The Trust Fabric (§3) is the feelings layer over frozen trust mechanics: buyer trust answered-before-asked; merchant trust as a track record (a reference, never a game profile; new-with-dignity; trajectory over snapshot; repair visible); community trust as authenticity-over-volume with dignity-preserving moderation; AI trust as the glass engine (explanation quartet, visible self-demotion, self-reported mistakes). Trust is ambient, never argumentative; signals are quiet, factual, universal, and never for sale. **X-15** Trust repair (§3.6) is a defining product experience: own it fast, fix it visibly, follow through; disclosure over discovery; the fair judge; repair ends forward. **X-16** Signature Moments (§14) replace the v1.0 delight registry as a full system: laws (rare, earned, personal, skippable, once-only, well-timed), three intensity tiers with budgets, per-moment emotional specifications for merchant, customer, community, and recovery journeys; dismissal rates are the celebration-inflation alarm. **X-17** Ignite witnesses, never performs: evidence-bearing congratulation, at most one riding proposal, warmth through specificity, and no celebration is ever an engagement tactic.

---

*The Experience Bible in one sentence: DOF should feel the way a great small shop feels to its owner on a good morning — everything in its place, the kettle already on, someone capable beside you who believes in the thing you're building, and the certain knowledge that if anything goes wrong today, it will be handled honestly.*
