# Hypothesis Register

Every assumption DOF is built on, with its evidence and its fate. Statuses:
**Open** (untested against reality) · **Validated** · **Rejected** · **Archived**.
Numbers are never reused. Field evidence cites OBS/INT/VERB files; build-era
evidence cites commits, tests, or the Learning Ledger.

⚠️ As of first light, NO field data exists. Every "Open" row below is honest
about that: the only evidence to date is synthetic (demo seed + founder
probes). The register's job now is to be filled by reality.

---

## Open — awaiting field evidence

### H-01 · Chronological honesty is enough
- Assumption: a strictly chronological Home (no ranking) feels alive and fair.
- Supporting: mechanical only — feed blends five voices (v1.5 e2e green).
- Contradicting: none yet.
- Confidence: medium (design conviction, zero field exposure).
- Decision: hold until ≥3 merchants' audiences use Home. → Ledger E6.

### H-02 · Stories earn follows
- Assumption: storied stores out-convert storyless ones.
- Supporting: demo-only E3 (2.67 vs 0 follows/store) — self-fulfilling seed.
- Contradicting: none yet. Confidence: low. → Ledger E3, customer OBS.

### H-03 · Possession converts to identity when stakes are visible
- Assumption: possession-holders keep their corner at a meaningful rate (~10%+).
- Supporting: E5 shows 1/4 — the claimant was a founder probe.
- Contradicting: none yet. Confidence: unknown. → Ledger E5.

### H-04 · Momentum nudges raise publish frequency
- Assumption: workspace nudges → merchants publish sooner.
- Supporting: none real (E1 has no control cohort).
- Contradicting: none yet. Confidence: unknown. → Ledger E1/E2 + INT day-10 Q4.

### H-05 · The share is the acquisition channel
- Assumption: merchants proudly share; their audiences arrive and engage.
- Supporting: unfurl mechanics verified (v1.1 probes).
- Contradicting: none yet. Confidence: low-medium. → customer OBS success bar.

### H-06 · "Voice without checkout" is acceptable to the right merchants
- Assumption: correctly-recruited merchants stay despite no orders.
- Supporting: none. Contradicting: none.
- Confidence: low — playbook ranks its failure the #1 risk.
- Decision: recruitment script mitigates; every "how do I buy?" verbatim is
  evidence AGAINST. Three independent merchants losing motivation over it =
  the roadmap changes.

### H-07 · Merchant language landed ("spark", "on your store", "promise")
- Assumption: the vocabulary needs no explanation.
- Supporting: internal discipline only (Release 0.2 law, token-gated copy).
- Contradicting: none yet. Confidence: low — never met a stranger.
- Decision: OBS journeys 2–5 watch-points; any "I thought spark meant…"
  verbatim files here.

### H-08 · Session-mode auth survives real devices
- Assumption: register → verify → login works for non-founders on phones.
- Supporting: mechanical (e2e, integration). Field: never once.
- Confidence: low. S-severity rules apply — a blocked arrival bypasses the
  Rule of Three.

---

## Validated — by build-era reality (commit evidence)

### H-20 · The claim seam generalizes (VALIDATED)
- Assumption: identity_claims could carry any artifact type.
- Evidence: visitor corners shipped on it with zero migration (v1.3, PR #3).

### H-21 · One UNION read can serve the whole Home (VALIDATED)
- Assumption: five voices, one query, no read-model sprawl.
- Evidence: releases 0.7–0.9 stacked voices into one statement; drift-guarded
  (learning-ledger tests, PR #4).

---

## Rejected — by build-era reality

### H-30 · The milestone ladder reflects merchant state (REJECTED)
- Assumption: next_milestone_id could drive post-setup guidance.
- Contradicting evidence: the ladder cannot see products/sparks; active
  merchants parked at 'first_product' forever (found live, Release 0.8).
- Decision: momentum facts outrank the parked ladder (commit 32b38be).

### H-31 · Green gates imply a working production path (REJECTED)
- Contradicting evidence: the cron lane drained only 2 of 4 outboxes —
  identity events would never have dispatched in production; caught only by
  the First Light audit (commit b8c6424). Documentation lesson: rehearsal
  correctness ≠ production correctness; smoke + audit are permanent fixtures.

### H-32 · The demo can stand in for users (REJECTED)
- Contradicting evidence: Ledger v1.4 — every metric synthetic, N≈6, all
  founder-generated. Decision recorded: no feature selection from demo data,
  ever (Release 1.5 selection rule).

---

## Filing rules

- New hypothesis: next free H-##, status Open, evidence lines mandatory even
  when "none".
- Status changes cite evidence (OBS/INT/VERB/ledger/commit) in the same commit.
- Rejected ≠ deleted. A dead assumption teaches longer than a living guess.
