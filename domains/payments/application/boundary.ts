/**
 * The provider boundary driver (C10 Slice 1 — UPDATED_PAYMENT_LIFECYCLE §7).
 * The ONLY place a payment provider is ever spoken to. Phase 2 runs with the
 * G2 tripwire armed: a provider call inside an open transaction throws.
 *
 * drive(opId)  — one journaled operation: load (short tx) → provider (no tx)
 *                → settle (short tx, guarded by the pending→succeeded flip, so
 *                racing drivers settle exactly once).
 * driveAll()   — the recovery sweep: re-drives anything pending past a grace
 *                window (crash between phases, provider hiccup, sweep-enqueued
 *                work). Alarms once per operation when attempts hit the wall.
 *
 * Outcome semantics: a DECLINE is a *succeeded operation* whose recorded outcome
 * is a failed intent; only infrastructure failures keep an operation pending.
 */
import type { Tx } from '../../../platform/types'
import { asClient, assertOutsideTransaction } from '../../../platform/db'
import type { PaymentsService, ProviderOperation, ProviderPort } from './payments'

const ALARM_AT_ATTEMPTS = 5
const RECOVERY_GRACE_SECONDS = 30

export type DriveOutcome =
  | { settled: true; outcome: 'succeeded' }
  | { settled: false; outcome: 'already_settled' | 'abandoned' | 'retrying' | 'missing'; detail?: string }

export class PaymentsBoundary {
  constructor(private readonly deps: {
    runTx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>
    provider: ProviderPort
    service: PaymentsService
    alarm: (message: string) => void
  }) {}

  async drive(opId: string): Promise<DriveOutcome> {
    assertOutsideTransaction(`boundary.drive(${opId})`)
    const op = await this.deps.runTx(async (tx) => {
      const { rows } = await asClient(tx).query<ProviderOperation & { amount_minor: string | null }>(
        `UPDATE provider_operations SET attempts = attempts + 1, updated_at = now()
         WHERE id = $1 AND state = 'pending'
         RETURNING id, kind, idempotency_key, attempt_key, intent_id, provider_ref, order_id,
                   business_id, amount_minor::text AS amount_minor, currency, state, attempts, detail`,
        [opId])
      return rows[0] ? { ...rows[0], amount_minor: rows[0].amount_minor === null ? null : Number(rows[0].amount_minor) } : null
    })
    if (!op) {
      const state = await this.deps.runTx(async (tx) => {
        const { rows } = await asClient(tx).query<{ state: string }>(`SELECT state FROM provider_operations WHERE id = $1`, [opId])
        return rows[0]?.state ?? null
      })
      if (state === 'succeeded') return { settled: false, outcome: 'already_settled' }
      if (state === 'abandoned') return { settled: false, outcome: 'abandoned' }
      return { settled: false, outcome: 'missing' }
    }

    // ——— phase 2: the provider, OUTSIDE any transaction, under the stable key
    let result:
      | { kind: 'settle'; payload: { ok: true; auth: { providerRef: string } } | { ok: false; detail: string } | null }
      | { kind: 'retry'; detail: string }
    try {
      switch (op.kind) {
        case 'authorize': {
          const r = await this.deps.provider.authorize({
            attemptKey: op.attempt_key!, amountMinor: op.amount_minor!, currency: op.currency!,
          })
          result = !r.ok && r.retryable ? { kind: 'retry', detail: r.detail } : { kind: 'settle', payload: r }
          break
        }
        case 'capture': {
          const r = await this.deps.provider.capture(op.provider_ref ?? '', op.amount_minor!)
          // capture failures retry (bounded by the order's 24h honest failure)
          result = r.ok ? { kind: 'settle', payload: null } : { kind: 'retry', detail: r.detail }
          break
        }
        case 'refund': {
          const r = await this.deps.provider.refund(op.provider_ref ?? '', op.amount_minor!, op.idempotency_key)
          // keystone semantics: a refused refund RETRIES until it lands or a human steps in
          result = r.ok ? { kind: 'settle', payload: null } : { kind: 'retry', detail: r.detail }
          break
        }
        case 'void': {
          await this.deps.provider.void(op.provider_ref ?? '')
          result = { kind: 'settle', payload: null }
          break
        }
        default:
          result = { kind: 'retry', detail: `unknown operation kind ${op.kind}` }
      }
    } catch (error) {
      result = { kind: 'retry', detail: (error as Error).message }
    }

    if (result.kind === 'retry') {
      await this.deps.runTx((tx) => asClient(tx).query(
        `UPDATE provider_operations SET last_error = $2, updated_at = now() WHERE id = $1`,
        [op.id, result.kind === 'retry' ? result.detail : null]))
      if (op.attempts >= ALARM_AT_ATTEMPTS) {
        this.deps.alarm(`[payments] provider operation ${op.kind} ${op.id} (order ${op.order_id ?? '—'}) still failing after ${op.attempts} attempts: ${result.detail} — the driver keeps retrying; a human should look`)
      }
      return { settled: false, outcome: 'retrying', detail: result.detail }
    }

    // ——— phase 3: settle exactly once (the pending→succeeded flip is the guard)
    const settled = await this.deps.runTx(async (tx) => {
      const { rows } = await asClient(tx).query<{ id: string }>(
        `UPDATE provider_operations SET state = 'succeeded', last_error = NULL, updated_at = now()
         WHERE id = $1 AND state = 'pending' RETURNING id`, [op.id])
      if (!rows[0]) return false
      switch (op.kind) {
        case 'authorize': await this.deps.service.settleAuthorization(tx, op, result.payload!); break
        case 'capture': await this.deps.service.settleCapture(tx, op); break
        case 'refund': await this.deps.service.settleRefund(tx, op); break
        case 'void': await this.deps.service.settleVoid(tx, op); break
      }
      return true
    })
    return settled ? { settled: true, outcome: 'succeeded' } : { settled: false, outcome: 'already_settled' }
  }

  /** The recovery sweep — cron lane. Re-drives pending work past the grace window. */
  async driveAll(limit = 25): Promise<{ driven: number; settled: number }> {
    assertOutsideTransaction('boundary.driveAll')
    const ids = await this.deps.runTx(async (tx) => {
      const { rows } = await asClient(tx).query<{ id: string }>(
        `SELECT id FROM provider_operations
         WHERE state = 'pending' AND updated_at < now() - ($2 || ' seconds')::interval
         ORDER BY created_at LIMIT $1`, [limit, RECOVERY_GRACE_SECONDS])
      return rows.map((r) => r.id)
    })
    let settled = 0
    for (const id of ids) {
      const outcome = await this.drive(id).catch(() => null)
      if (outcome?.settled) settled += 1
    }
    return { driven: ids.length, settled }
  }
}
