# Founder Reflection Loop

The founder is part of the system, therefore a source of bias. This loop
evaluates the founder, not the product — 10–15 minutes, immediately after
every Founder Review, filed beside the REV entry as `review/log/REFL-<date>.md`
(template: `templates/reflection.md`).

The goal is not perfection, and not self-criticism. The goal is becoming
progressively less biased — measured the only way that counts: decisions that
later look right more often.

## The 15 minutes, in order

1. **Reflection questions** (~7 min) — answer fast and honestly; skip any
   that genuinely don't apply this week (writing "n/a" is honest; writing
   filler is bureaucracy):
   - What surprised me this week?
   - Which assumption did I defend too strongly?
   - Which assumption changed?
   - Did I ignore any evidence because it was uncomfortable?
   - Did I prematurely suggest solutions?
   - Did I confuse a feature request with an underlying problem?
   - Did I spend time on work that did not increase learning?
   - What decision would I make differently now?
2. **Bias scan** (~3 min) — read the table below; flag any bias that fired
   this week with one concrete instance. Zero flags is a valid answer;
   zero flags *every* week is itself a flag.
3. **Journal lines** (~5 min) — seven one-liners (template). One line each.
   If a line wants a paragraph, it's an observation or a hypothesis — file it
   there instead.

## Decision-making bias reference

(Evidence-*collection* biases — founder proximity, politeness, survivorship —
live in `research/REALITY_REVIEW.md` and run during reviews. These are the
biases that fire while *deciding*.)

| Bias | What it looks like in product work | How to recognize it | Counter |
|---|---|---|---|
| Confirmation | Reading the friction log for support of the release you already want | You knew the "winner" before Step 5 | Write the expected winner down BEFORE Step 1; compare after |
| Sunk-cost | Protecting a shipped feature from evidence because it cost weeks | "But we just built…" appears in your reasoning | Ask: would this candidate win if the old work were free to delete? |
| Recency | Yesterday's vivid session outranking last week's three-merchant pattern | The newest OBS file dominates the review | Re-read patterns oldest-first before scoring |
| Authority | Your own voice ending debates; merchants deferring to you in sessions | Nobody pushed back this week | Have the matrix scored before revealing your own scores |
| Availability | Building for the friction you can *picture* over the one that measured worse | The candidate with the best anecdote beats the one with the best frequency | Frequency column is counted, never estimated from memory |
| Solution-first | Jumping from "merchants hesitate at X" to "add a button" in one breath | Proposal files written before pattern review finished | Candidates may not be drafted until Step 4, by rule |
| Selection | Recruiting/listening to merchants who resemble the plan | The cohort all praise the same thing | Interview the churned merchant; weight silence as data |

## Decision retrospectives

Every shipped release gets one retrospective at the first review where its
outcome is measurable (template: `templates/decision-retro.md`, filed as
`review/log/RETRO-<release>.md`). Expected vs actual, in writing, against the
"expected outcome" line of the original proposal — the loop that makes
judgment improvable rather than just confident.

## Anti-bureaucracy sunset clause

This process is simplified (to three questions) or paused when any of:
- reflections start reading copy-pasted from previous weeks
- the exercise exceeds 15 minutes twice in a row
- eight consecutive entries change nothing about how reviews are run

Reflection that changes no behavior is ceremony. Remove ceremony.
