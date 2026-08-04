/**
 * The money ledger (C4; A8-1, L1–L3): balanced postings only, append-only,
 * cached balances with the recompute identity. Split from payments.ts in C11
 * S1 — motion only; payments.ts re-exports.
 */
import { uuidv7 } from '../../../platform/uuid'
import type { Tx } from '../../../platform/types'
import { asClient } from '../../../platform/db'

export type LedgerAccountKind =
  | 'psp_clearing' | 'merchant_holding' | 'merchant_payable'
  | 'platform_fees' | 'psp_fee_expense' | 'refund_liability' | 'dispute_reserve'

export interface LedgerLeg { kind: LedgerAccountKind; businessId: string | null; deltaMinor: number }

export class LedgerPoster {
  /** The only write path for money truth: one balanced posting, atomically. */
  async post(tx: Tx, currency: string, legs: LedgerLeg[], cause: Record<string, unknown>): Promise<string> {
    const sum = legs.reduce((s, leg) => s + leg.deltaMinor, 0)
    if (sum !== 0) throw new Error(`unbalanced posting: ${sum} (L1)`)
    const client = asClient(tx)
    const postingId = uuidv7()
    for (const leg of legs) {
      // CERTIFICATION FINDING: NULL business_id is DISTINCT under the table's
      // UNIQUE — platform-level legs need the partial index's conflict target,
      // or every posting mints a fresh account and balances fragment.
      const { rows } = leg.businessId === null
        ? await client.query<{ id: string }>(
            `INSERT INTO ledger_accounts (id, kind, business_id, currency)
             VALUES ($1, $2, NULL, $3)
             ON CONFLICT (kind, currency) WHERE business_id IS NULL DO UPDATE SET kind = EXCLUDED.kind
             RETURNING id`,
            [uuidv7(), leg.kind, currency])
        : await client.query<{ id: string }>(
            `INSERT INTO ledger_accounts (id, kind, business_id, currency)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (kind, business_id, currency) DO UPDATE SET kind = EXCLUDED.kind
             RETURNING id`,
            [uuidv7(), leg.kind, leg.businessId, currency])
      const accountId = rows[0]!.id
      await client.query(`SELECT id FROM ledger_accounts WHERE id = $1 FOR UPDATE`, [accountId])
      await client.query(
        `INSERT INTO ledger_entries (id, posting_id, account_id, delta_minor, cause) VALUES ($1, $2, $3, $4, $5)`,
        [uuidv7(), postingId, accountId, leg.deltaMinor, JSON.stringify(cause)])
      await client.query(
        `UPDATE ledger_accounts SET balance_minor = balance_minor + $2 WHERE id = $1`,
        [accountId, leg.deltaMinor])
    }
    return postingId
  }

  /** L3 — the recompute identity: cached balances ≡ entry sums. Loud when false. */
  async recomputeCheck(tx: Tx): Promise<{ clean: boolean; drift: Array<{ account_id: string; cached: number; actual: number }> }> {
    const { rows } = await asClient(tx).query<{ account_id: string; cached: string; actual: string }>(
      `SELECT a.id AS account_id, a.balance_minor::text AS cached,
              COALESCE((SELECT sum(e.delta_minor) FROM ledger_entries e WHERE e.account_id = a.id), 0)::text AS actual
       FROM ledger_accounts a`)
    const drift = rows.filter((r) => r.cached !== r.actual)
      .map((r) => ({ account_id: r.account_id, cached: Number(r.cached), actual: Number(r.actual) }))
    return { clean: drift.length === 0, drift }
  }
}

