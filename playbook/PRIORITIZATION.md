# Release Prioritization Matrix

How Release 1.6 gets chosen — after observation, never before.

## Preconditions (all three)

1. ≥3 merchants observed through all journeys (OBSERVATION_MERCHANT.md)
2. ≥7 days of real traffic after the merchants' shares
3. One production `npm run learning` readout on file

## The override rule

**Any S1 friction is fixed immediately, outside this matrix.**
**Any S2 friction hit by ≥2 merchants IS Release 1.6.** No candidate feature,
however attractive, outranks a journey that blocked half the cohort.

## The matrix (when no override fires)

Score every candidate — friction fixes and roadmap candidates (Weekly Corner
Note, Deal Momentum, Claim Refinement, Acquisition) enter on equal terms, each
with its evidence attached or it does not enter.

| Dimension | Scale | Definition |
|---|---|---|
| Severity (Sev) | S1–S4 / none | from the friction log; a GATE, not a score (see overrides) |
| Frequency (F) | 0–3 | 3 = every merchant/visitor, every session · 0 = rare |
| Customer value (C) | 0–3 | change in a real customer's week |
| Merchant value (M) | 0–3 | change in a real merchant's week |
| Learning value (L) | 0–3 | what the ledger/next review can measure after shipping |
| Effort (E) | days | honest engineering days, ≤5 or it must shrink |
| Risk | low/med/high | blast radius if it ships wrong |
| Trust impact | cap | anything that could lose merchant work or embarrass them publicly CAPS the ranking of every competing candidate until addressed |

**Score per engineering day = ((C + M) × F + L) / E.**
Gates and modifiers, in order:
1. Severity gates: S1 → hotfix outside the matrix; S2 hit by ≥2 merchants →
   it IS the release.
2. Trust cap: while any trust-impacting item is open, no feature outranks it.
3. Risk discounts ties: at equal score, lower risk wins.
4. Remaining ties: friction fix over feature, then the candidate whose
   failure would teach more.
Every score carries a one-line justification in the weekly review — numbers
without sentences are not rankings.

## Worked format

| Candidate | Evidence | C | M | F | L | E | Score/day |
|---|---|---|---|---|---|---|---|
| *(filled after observation)* | friction F-### / ledger E# / interview Q# | | | | | | |

## Discipline

- The complexity budget governs the winner: ≤5 days, ≤300 LOC, no speculative
  architecture, reuse aggressively.
- Candidates without attached evidence are not scored — they wait.
- The losing candidates and their scores are kept in this file: next cycle
  starts from an honest record, not a fresh opinion.
