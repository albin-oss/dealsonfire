/**
 * THE payout-hold release policy (C6 — ORR-C3; campaign directive: one policy,
 * never duplicated across handlers). Pure: case FACTS in, decision out — the
 * cron composes it with the ledger movement (PaymentsService.releaseHold).
 *
 *   digital  → release on verified grant (the grant IS the delivery)
 *   pickup   → release on recorded handover (collected)
 *   ship     → release at dispatch + 7 QUIET days (manual tracking makes
 *              "shipped" a merchant claim; the quiet week is the substitute
 *              for carrier truth until real carrier evidence exists)
 *
 * An order releases only when EVERY case satisfies its rule (mixed orders wait
 * for the slowest case) and at least one case exists. Buyer-protection flags
 * (C9 returns/not-received) will veto via the exception hook when they exist.
 */
export interface CaseFact {
  method: 'ship' | 'pickup' | 'digital'
  state: string
  dispatched_at: string | null
  handed_over_at: string | null
}

const QUIET_DAYS_MS = 7 * 86_400_000

export function holdReleaseDue(cases: CaseFact[], now: Date, hasException = false): boolean {
  if (hasException || cases.length === 0) return false
  return cases.every((c) => {
    if (c.method === 'digital') return c.state === 'granted' && c.handed_over_at !== null
    if (c.method === 'pickup') return c.state === 'collected' && c.handed_over_at !== null
    // ship: dispatched + the quiet week
    if (c.state !== 'dispatched' || !c.dispatched_at) return false
    return now.getTime() - new Date(c.dispatched_at).getTime() >= QUIET_DAYS_MS
  })
}
