/**
 * GET /api/v1/account (C12-3) — the stranger-minimum inspect surface: what DOF
 * actually owns about a person, nothing more. No profile, no preferences.
 */
import { defineQueryEndpoint } from '../../../utils/define-command-endpoint'
import { getContainer } from '../../../utils/container'
import { maskEmail } from '@domains/identity/application/email-change-service'

export default defineQueryEndpoint({
  async handler({ auth }) {
    const c = getContainer()
    const user = await c.identity.auth.getUser(auth.userId)
    if (!user) return { error: 'not found' }
    const { rows: pending } = await c.pool.query<{ new_email: string }>(
      `SELECT new_email FROM email_changes WHERE user_id = $1 AND state = 'pending'`, [auth.userId])
    const { rows: sessions } = await c.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL AND rolling_expires_at > now()`, [auth.userId])
    const { rows: passkeys } = await c.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM user_passkeys WHERE user_id = $1`, [auth.userId])
    const { rows: consents } = await c.pool.query<{ document_id: string; version: string; action: string }>(
      `SELECT DISTINCT ON (document_id) document_id, version, action
       FROM consent_facts WHERE user_id = $1 ORDER BY document_id, occurred_at DESC`, [auth.userId])
    return {
      email: user.email,
      email_verified: user.emailVerified,
      pending_email_change: pending[0] ? maskEmail(pending[0].new_email) : null,
      active_sessions: sessions[0]?.n ?? 0,
      passkeys: passkeys[0]?.n ?? 0,
      step_up_verified: auth.stepUpVerified,
      consents: consents.map((r) => ({ document: r.document_id, version: r.version, action: r.action })),
    }
  },
})
