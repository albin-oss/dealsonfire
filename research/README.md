# DOF Research Repository

Human learning, preserved so it survives founders. Not analytics — the Learning
Ledger (`npm run learning`) counts what happened; this repository preserves
**why**, in the words of the people it happened to.

## Structure

```
research/
  README.md            ← this constitution
  HYPOTHESES.md        ← the register: every assumption, its evidence, its status
  REALITY_REVIEW.md    ← the weekly process + documentation-update workflow
  templates/           ← observation · interview · verbatim
  observations/        ← one file per session:  OBS-<seq>-<merchant-id>-<journey>.md
  interviews/          ← one file per interview: INT-<seq>-<merchant-id>-<day>.md
  verbatims/           ← one file per merchant:  VERB-<merchant-id>.md (append-only)
```

## Laws

1. **Verbatim first.** The original sentence is always preserved; interpretation
   is a separate, later, clearly-marked act. "I thought Spark meant discount"
   is data. "Confused by sparks" is opinion about data.
2. **Versioned like code.** Every observation lands via commit; corrections are
   new commits, never edits that erase. Git history is the provenance chain.
3. **Rule of Three.** One merchant = anecdote. Two = possible pattern. Three
   independent merchants = product truth. Exceptions that bypass the rule:
   S1, S2, and anything trust-damaging.
4. **Reality overrides design.** A repeated real behavior outranks architecture,
   wireframes, the Platform Bible, and every prior assumption. When
   documentation becomes inaccurate, documentation is updated (see
   REALITY_REVIEW.md) — reality is never reinterpreted to fit it.
5. **Anonymize customers, pseudonymize merchants.** Merchants are `M1…Mn` in
   files (the mapping lives outside the repo). Customers are never named,
   never identifiable. No emails, handles-of-real-accounts, or faces in
   screenshots committed here.
6. **Nothing is pre-filled.** Empty folders stay empty until reality fills
   them. A fabricated observation is worse than none — it poisons the register.

## Identifiers

- Merchants: `M1`, `M2`, … (stable per person, assigned at recruitment)
- Observations: `OBS-001-M1-ignite.md` (sequence, merchant, journey)
- Hypotheses: `H-##` (never reused, even after archive)
- Frictions: `F-###` (in `playbook/FRICTION_LOG.md`; cross-referenced from here)

## For a founder reading this in one year

Start with HYPOTHESES.md — statuses tell you what we believed and what
happened to each belief, with links to the evidence. Then read the verbatims
of any one merchant end-to-end: that is what DOF felt like at first light.
