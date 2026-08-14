/**
 * POST /api/webhooks/mail — the provider's delivery-outcome intake (C12-1).
 * Resend webhooks (Svix envelope): HMAC-SHA256 over `${id}.${timestamp}.${body}`
 * with the base64 secret from NUXT_MAIL_WEBHOOK_SECRET (`whsec_…`).
 *
 * Security posture (binding): signature verified (constant-time), replay-safe
 * (timestamp tolerance + provider event id dedup in mail_bounces), FAIL CLOSED
 * (no secret in production → 503; bad signature → 401), payload bounded.
 * Only bounce/complaint facts persist — everything else acknowledges and drops
 * (delivery confirmations are the provider's world, never our claim).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { defineEventHandler, getHeader, readRawBody, setResponseStatus } from 'h3'
import { getContainer } from '../../utils/container'
import { getServerConfig } from '../../utils/config'
import { optionalEnv } from '@platform/config'

const MAX_BODY_BYTES = 64 * 1024
const TIMESTAMP_TOLERANCE_S = 5 * 60

function verifySvix(secret: string, id: string, timestamp: string, body: string, signatureHeader: string): boolean {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
  // the header carries space-separated versioned signatures: "v1,<sig> v1,<sig>"
  return signatureHeader.split(' ').some((part) => {
    const [version, sig] = part.split(',')
    if (version !== 'v1' || !sig) return false
    const a = Buffer.from(expected)
    const b = Buffer.from(sig)
    return a.length === b.length && timingSafeEqual(a, b)
  })
}

export default defineEventHandler(async (event) => {
  const secret = optionalEnv('NUXT_MAIL_WEBHOOK_SECRET')
  if (!secret) {
    // fail closed: an unconfigured intake refuses rather than accepting unsigned truth
    setResponseStatus(event, getServerConfig().isProduction ? 503 : 501)
    return { error: 'mail webhook not configured' }
  }
  const id = getHeader(event, 'svix-id') ?? ''
  const timestamp = getHeader(event, 'svix-timestamp') ?? ''
  const signature = getHeader(event, 'svix-signature') ?? ''
  const raw = (await readRawBody(event, 'utf8')) ?? ''
  if (!id || !timestamp || !signature || raw.length === 0 || Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    setResponseStatus(event, 400)
    return { error: 'malformed' }
  }
  const skewSeconds = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(skewSeconds) || skewSeconds > TIMESTAMP_TOLERANCE_S) {
    setResponseStatus(event, 401)
    return { error: 'stale' }
  }
  if (!verifySvix(secret, id, timestamp, raw, signature)) {
    setResponseStatus(event, 401)
    return { error: 'signature' }
  }

  let payload: { type?: string; created_at?: string; data?: { email_id?: string; to?: string[] | string; bounce?: { type?: string } } }
  try {
    payload = JSON.parse(raw)
  } catch {
    setResponseStatus(event, 400)
    return { error: 'malformed' }
  }

  const kind = payload.type === 'email.bounced' ? 'bounce'
    : payload.type === 'email.complained' ? 'complaint'
    : null
  if (!kind) return { received: true } // not an outcome we persist

  const to = Array.isArray(payload.data?.to) ? payload.data?.to[0] : payload.data?.to
  if (!to) return { received: true }
  // Resend bounce classification: 'Transient' is a soft bounce — recorded,
  // never suppressing; everything else (Permanent/undetermined) suppresses
  const permanent = kind === 'complaint' || payload.data?.bounce?.type !== 'Transient'

  const c = getContainer()
  await c.mailJournal.recordBounce({
    providerEventId: id,
    providerRef: payload.data?.email_id ?? null,
    recipient: to,
    kind,
    permanent,
    occurredAt: payload.created_at ?? new Date().toISOString(),
  })
  return { received: true }
})
