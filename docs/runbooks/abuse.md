# Runbook — Abuse triage (C12-2)

## The loop

REPORT (public door, info-free answers) → RECORD (`abuse_reports`, deduped per
reporter+subject) → OPERATOR VISIBILITY (`abuse_report` arm in
`/api/v1/ops/alarms`) → DECISION (hold / dismiss) → ENFORCEMENT (existing
`enforcement_hold` semantics — the store vanishes behind masked reads, its
till closes; NOTHING ELSE changes) → AUDIT (every act, sensitive, step-up).

## Triage

1. `GET /api/v1/ops/alarms` — `abuse_report` rows carry subject + reason.
2. Look at the subject through the public surfaces and the ops order tooling.
3. Decide:
   - benign → `UPDATE abuse_reports SET state='dismissed', resolved_at=now(), resolved_by='<your-user-id>', resolution='<why>' WHERE id='<id>'` (a dismissal command arrives with the Administration domain; SQL-with-reason is the honest interim, mirroring the pre-C9 posture).
   - real → hold the store (below). Holding resolves the store's open reports with your reason automatically.

## Hold / lift (operator + step-up — re-authenticate within 5 minutes first)

```bash
curl -X POST "$APP/api/v1/ops/stores/$STORE_ID/hold" -H "Authorization: …" \
  -d '{"reason":"counterfeit listing — evidence in support thread"}'
```

```bash
curl -X POST "$APP/api/v1/ops/stores/$STORE_ID/release" -H "Authorization: …" \
  -d '{"reason":"review finished — listing genuine"}'
```

- Hold = `enforcement_hold: under_review`. Public surfaces answer 404 (masked —
  the EXISTING semantics; no "closed for review" page exists, by decision);
  checkout refuses through the same reads. **Payouts are untouched** — money
  in flight completes; freezing money is Payments' risk machinery, never this.
- The maker receives an honest letter on hold and on lift (critical class).
- Lift refuses `suspended` holds — those belong to the standing policy and
  lift only through remediation.
- Hold for plausible buyer harm (counterfeit, scam, dangerous); escalate
  anything legal-shaped (threats, court orders, identity claims) to the
  Founder before acting.

## Flooding

The report door sits behind the durable limiter (10/hour per /64-normalized
address) plus per-reporter+subject dedup. A flood that still hurts is a
limiter-budget conversation, not a schema change.
