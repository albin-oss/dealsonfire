# Runbook — External reconciliation & disputes (C10 Slice 4)

## Reconciliation: "does Stripe agree with our books?"

The cron tick runs `reconciliation.maybeRun()` — self-gating to once per 24h of
watermark. Each Stripe balance transaction lands as ONE `reconciliation_items`
row, replay-idempotent by the provider's transaction id. Charges and refunds
match against `payment_facts` by intent ref + amount; payouts and Stripe fees
match by category. Unmatched rows persist, alarm (`NUXT_OPS_ALARM_EMAIL` + the
`recon_unmatched` kind in `/api/v1/ops/alarms`), and wait for a human.

**THE LAW: no silent ledger adjustment.** Reconciliation observes drift; it
never fixes it. Corrections happen through the audited primitives (ops refund,
dispute resolution) or a documented migration — never by editing balances.

### Investigating an unmatched item
1. `SELECT * FROM reconciliation_items WHERE state = 'unmatched' ORDER BY created_at` —
   or the `recon_unmatched` rows in `/api/v1/ops/alarms`.
2. Find the provider side: the `provider_txn_id` in the Stripe dashboard's
   balance activity; `provider_events.payload` holds every webhook's exact words.
3. Find our side: `GET /api/v1/ops/orders/:orderId` reconstructs everything; or
   match by `payment_intents.provider_ref`.
4. Typical causes: a §7 operation that succeeded at Stripe but whose settle
   never recorded (check `provider_operations` for pending/abandoned rows — the
   driver may just need the operation re-armed); a dashboard-side manual action
   (record it as an ops note + explain the item); a genuinely foreign movement
   (escalate).
5. Close the loop: `UPDATE reconciliation_items SET state = 'explained', note = '…'`
   is permitted ONLY with the explanation written and, when money moved, the
   corresponding audited correction already made.

### Interrupted runs
A `running` row older than an hour is marked `failed` on the next tick and its
ground is re-covered automatically (items can't double — unique by txn id).

## Disputes: the manual evidence workflow

A `charge.dispute.created` webhook freezes the merchant's unreleased entitlement
(holding → dispute_reserve, bounded by what holding still has), writes the
internal timeline note, letters the maker with the DEADLINE, and appears as
`dispute_open` in `/api/v1/ops/alarms` until resolved.

**Evidence is submitted in the Stripe dashboard** (Payments → Disputes) at
launch volume — collect the maker's photos/tracking/messages via support and
upload before `evidence_due_at`. The `charge.dispute.closed` webhook settles:

- **won** — the frozen entitlement returns to the maker's holding.
- **lost** — APPROVED POLICY: DOF absorbs ordinary good-faith losses. The
  frozen entitlement RETURNS to the maker; the whole loss posts to
  `psp_fee_expense`. Recovery from a merchant is ONLY for documented
  merchant-caused loss (fraud, collusion, intentional non-delivery, material
  misrepresentation, repeated abuse) — a human decision with evidence on file,
  executed as an audited ops action, never automatic.

## Risk pause & resume

Crossing an exposure limit (`NUXT_RISK_MAX_MERCHANT_OPEN_DISPUTES_MINOR`,
`NUXT_RISK_MAX_MERCHANT_LOSS_MINOR`, `NUXT_RISK_MAX_ORDER_MINOR` per-order)
pauses the till: storefront stays, buyer protections stand, checkout closes,
payouts hold, `risk_paused` alarms. Review the merchant's pattern, then resume
with the audited human act:

```bash
curl -X POST "$APP/api/v1/ops/businesses/$BUSINESS_ID/risk-resume" \
  -H "Authorization: …" -d '{"reason":"reviewed — dispute cluster was one buyer; pattern benign"}'
```
