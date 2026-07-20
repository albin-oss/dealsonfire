# Friction Log

The living record. One entry per friction, filed the same day it is observed.
Interpretation lives here; raw observation lives in the session notes.

## Severity scale

| Severity | Meaning | Handling |
|---|---|---|
| **S1** | Trust-damaging: lost work, false 404 on a public page, broken share unfurl in front of an audience, data that vanished | **Hotfix now.** Preempts all other work, including Release 1.6 selection |
| **S2** | Journey-blocking: needed a human to proceed | Top of the 1.6 candidate list |
| **S3** | Slows or confuses but self-recovers | Batched; matrix-ranked |
| **S4** | Cosmetic / preference | Logged; never jumps the queue on volume of complaint |

## Frequency

Count **merchants affected** (of cohort N), not occurrences. `2/4` beats `1/4`
at equal severity, always.

## Entry template

```markdown
### F-### · <one-line title>
- Journey: <arrival | ignite | identity | product | deal | spark | share | home | claim>
- Expected: <what the product intends>
- Actual: <what happened — verbatim quotes where possible>
- Severity: S1 | S2 | S3 | S4
- Frequency: <merchants affected>/<cohort size>
- Root cause: <code / copy / concept / expectation — be specific, name files if known>
- Proposed fix: <smallest production change>
- Effort: <hours or days, honest>
- Source: <observation session / interview Q# / ledger / merchant report, with date>
```

## Filing rules

- One friction per entry, even if one session surfaces five.
- "Root cause: concept" is allowed — some frictions are ideas, not bugs, and
  their fix is language or sequencing, not code.
- An entry without a proposed fix is still filed. Unknown fixes are honest.
- Duplicates merge upward: bump Frequency, keep the earliest number.

---

## Entries

*(empty until first observation — do not pre-fill with guesses)*
