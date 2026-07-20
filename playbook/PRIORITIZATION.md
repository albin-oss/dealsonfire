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
| Customer impact (C) | 0–3 | change in a real customer's week |
| Merchant impact (M) | 0–3 | change in a real merchant's week |
| Frequency (F) | 0–3 | 3 = every merchant/visitor, every session · 0 = rare |
| Learning value (L) | 0–3 | what the ledger can measure after shipping it |
| Effort (E) | days | honest engineering days, ≤5 or it must shrink |
| Time to production (T) | days | includes verification, ≤ E+1 |

**Value per engineering day = (C + M) × F + L, divided by E.**
Ties break toward: (1) lower T, (2) friction fix over feature, (3) the
candidate whose failure would teach more.

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
