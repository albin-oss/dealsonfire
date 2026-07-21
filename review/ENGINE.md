# Founder Review Engine

The weekly ritual that turns evidence into exactly one release decision — the
same method, the same order, every week, by any founder. Never choose a
release from memory.

## Inputs (gather before starting; note each one's commit/date)

| Input | Where |
|---|---|
| Learning Ledger readout | `npm run learning` against production (read-only role) |
| Observations / interviews / verbatims | `research/observations|interviews|verbatims/` |
| Hypothesis register | `research/HYPOTHESES.md` |
| Friction reports | `playbook/FRICTION_LOG.md` |
| Production incidents | deployment logs / smoke failures since last review |
| Support requests | merchant messages, verbatim, if any |
| Deployment health | `npm run smoke -- <prod-url>` result |

Missing input = say so in the review. An absent input is a fact, not a skip.

## The six steps

Each step's procedure lives where stated; this file is the order and the law.

1. **Reality Review** — facts only, five buckets (measured / observed /
   verbatim / incidents / unknowns). Procedure: `research/REALITY_REVIEW.md`
   §1–2 (collect, cluster). No interpretation permitted in this step.
2. **Pattern Review** — repeated frictions, delights, misunderstandings,
   workarounds. Rule of Three applies; S1/S2/trust bypass it. Procedure:
   `research/REALITY_REVIEW.md` §3.
3. **Hypothesis Review** — every touched H-## moves (strengthened / weakened /
   validated / rejected / unknown) **with evidence cited in the same commit**.
   Procedure: `research/REALITY_REVIEW.md` §4.
4. **Opportunity Review** — generate candidates. Every candidate is a filled
   `review/templates/release-proposal.md`; a candidate without evidence is not
   a candidate. Friction fixes and roadmap ideas enter on equal terms.
5. **Prioritization** — score all candidates with the ONE matrix:
   `playbook/PRIORITIZATION.md`. Overrides fire before arithmetic (S1 → hotfix
   now; S2×2 merchants → it IS the release; trust impact caps everything).
   Every score gets a one-line justification.
6. **Decision** — exactly ONE release. Record it in `review/log/` using
   `review/templates/weekly-review.md`, including **why every other candidate
   lost** (their scores stay on record). The decision entry cites the research
   state (commit SHA) it was made from — that is the audit trail.

## Laws

- **One decision per review. One review per week.** During First Light: twice
  weekly, per the playbook cadence.
- **The complexity budget binds the winner** (≤5 days, ≤300 LOC, no
  speculative architecture) — a winning candidate that exceeds it must shrink
  before it ships.
- **Probe/founder-generated data never counts as evidence** (bias law,
  `research/REALITY_REVIEW.md`).
- **"No release" is a valid decision** and is logged like any other, with the
  evidence gap that forced it named explicitly.
- The bias checklist (`research/REALITY_REVIEW.md`) runs at Step 1 and again
  at Step 6, both times initialed in the log entry.

## Afterward: the reflection (10–15 min, not optional)

Every review ends with the Founder Reflection (`REFLECTION.md`): the founder
is part of the system and therefore a source of bias. File
`review/log/REFL-<date>.md` in the same commit as the REV entry. Shipped
releases additionally get a decision retrospective (`templates/decision-retro.md`)
at the first review where their outcome is measurable.

## Decision log

`review/log/REV-<yyyy-mm-dd>.md` — append-only, one file per review, template
in `review/templates/weekly-review.md`. Corrections are new commits. The log
IS the audit trail: inputs (with SHAs), candidates, matrix, decision, losers,
dissent if any.
