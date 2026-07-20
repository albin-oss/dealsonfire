# First Light Playbook

The operational plan for learning from DOF's first 3–5 real merchants.
The goal is not growth. The goal is understanding.

**The one sentence that governs everything:** if choosing between building a
feature and removing friction, remove friction.

## Contents

| Artifact | Purpose |
|---|---|
| [OBSERVATION_MERCHANT.md](OBSERVATION_MERCHANT.md) | Watch a merchant cross every journey, silently |
| [OBSERVATION_CUSTOMER.md](OBSERVATION_CUSTOMER.md) | Watch their audience arrive, engage, return |
| [INTERVIEW.md](INTERVIEW.md) | Non-leading scripts, merchant + customer |
| [FRICTION_LOG.md](FRICTION_LOG.md) | The living log + entry template + severity scale |
| [PRIORITIZATION.md](PRIORITIZATION.md) | How Release 1.6 gets chosen — and only after observation |

---

## 1 · Merchant recruitment

### Who the first merchants should be

Recruit people who are **already merchants somewhere** — an Instagram maker, an
Etsy seller, a market-stall regular — and for whom ALL of these are true:

1. **They make or source something real** with a story behind it. DOF's whole
   identity loop (story, promise, sparks) assumes there is a human worth meeting.
2. **They already talk about their work** — post photos, answer DMs. Sparks are
   for people who have things to say; recruiting the silent tests nothing.
3. **They have a small existing audience** (50–500 followers anywhere). Their
   share is DOF's first customer acquisition — by design (Release 1.1).
4. **You can reach them personally** — observation requires sitting beside them
   (or a screen-share) for their first hour.
5. **They accept what DOF is today** — a public voice and an audience, **not a
   checkout**. Orders happen through their existing channels (DMs, their Etsy).
   Say this in the first conversation, in these words: *"DOF is where people
   discover and follow you. Buying still happens wherever it happens today."*
   A merchant who needs payments this month will churn and their churn will
   teach nothing.

### Who should explicitly NOT be recruited

- **Friends being supportive.** Politeness poisons observation.
- **Dropshippers / resellers / agencies.** No story, no maker, nothing for the
  identity loop to hold; their churn is uninformative.
- **Established stores with ops teams.** Wrong scale; their needs (inventory,
  orders, integrations) are exactly what DOF deliberately hasn't built.
- **Anyone who requires payments now.** See above — recruit for the current
  truth, never against it.

### How many, and why

**Four.** Three is the minimum for any pattern to be a pattern rather than a
personality; five is the most one founder can observe at first-hour fidelity in
a week. Four leaves one slot for a mid-cohort replacement without restarting.

---

## 2 · Operating cadence (two weeks)

| Day | Activity |
|---|---|
| 1–4 | One merchant per day: observed first hour (OBSERVATION_MERCHANT), same-day 15-min interview |
| 3–10 | Each merchant shares their shop to their own audience; customer observation runs passively |
| 7 | Mid-cohort friction-log consolidation; fix any S1 immediately (S1 preempts everything) |
| 10–12 | Second interviews (what stuck, what lapsed); `npm run learning` against production |
| 13–14 | Prioritization matrix (PRIORITIZATION.md) → Release 1.6 selection |

Rules of the fortnight:

- **S1 frictions are hotfixes, not backlog.** Trust, once lost at N=4, is lost.
- **No new features ship during observation.** A moving product invalidates
  its own measurements.
- The friction log is updated the same day as the observation — memory decays
  by morning.

---

## 3 · The five most likely first-merchant failures

Ranked by expected likelihood × damage, with the repo facts behind each:

1. **The checkout mismatch.** "How does anyone buy?" DOF has no orders. If this
   surfaces AFTER onboarding instead of during recruitment, the merchant feels
   misled. *Solved first because it is solved with words, not code — it lives
   in the recruitment script above, costs zero engineering days, and every
   other failure only matters if the merchant stays.*
2. **Publishing into silence.** Week-one sparks earn zero fires; the pulse has
   nothing true to say; motivation dies before the loop closes. Mitigation is
   operational: merchants share on day 3–4 (their audience seeds engagement)
   — not fabricated engagement, ever.
3. **Real-device auth.** The merchant experience was built and verified under
   dev-header identity; session-mode UX (register → verify email → login) has
   only mechanical coverage. First Light is its first real user test. Watch it
   like a hawk (observation guide, journey 0).
4. **Mobile photo friction.** The composer is camera-first in design but has
   never met a real phone camera roll, HEIC files, or a slow uplink.
5. **Publish-semantics confusion.** Store live vs product on store vs deal vs
   spark — four verbs of "making public." The language was built carefully
   (Release 0.2's merchant-language law) but has never met a stranger.

**Trust-damaging (permanent):** anything that loses a merchant's words or work
— a spark that fails silently, a claim that drops follows, a published page
that 404s *in front of their audience*, a broken share unfurl in their group
chat. These are S1 by definition (FRICTION_LOG.md).

**Merely inconvenient:** copy, extra taps, layout on odd viewports, filter
labels, wanting reordering/pinning. These are S3–S4 and must not jump the queue
on volume of complaint alone.

---

## 4 · What evidence justifies Release 1.6

Only after ≥3 observed merchants and ≥7 days of real traffic:

- **A repeated S1/S2 friction** (≥2 merchants, same journey, same root cause)
  → the fix IS Release 1.6, regardless of any roadmap candidate.
- Otherwise → the prioritization matrix over: consolidated friction log +
  a production `npm run learning` readout + interview themes. Candidates enter
  the matrix with evidence attached or they do not enter at all.

The complexity budget continues to govern: ≤5 engineering days, ≤300 LOC,
no speculative architecture, reuse aggressively.
