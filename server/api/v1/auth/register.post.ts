/** POST /api/v1/auth/register (WP-R1-B1 US-1). Public; issues a session on success. */
import { getHeader } from 'h3'
import { getVisitorId } from '../../../utils/visitor'
import { definePublicEndpoint } from '../../../utils/define-public-endpoint'
import { getContainer } from '../../../utils/container'
import { setSessionCookie } from '../../../utils/auth-cookie'
import { registerRequest } from '@contracts/schemas/identity/auth.schema'
import { REGISTRATION_CONSENTS } from '@contracts/legal/documents'
import { asClient } from '@platform/db'
import { uuidv7 } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'auth.register',
  schema: registerRequest,
  successStatus: 201,
  rateLimit: { limit: 5, windowSeconds: 3600 },
  async handler({ event, body }): Promise<Result<{ user_id: string }, DomainError>> {
    const c = getContainer()
    const source = body.claim ? 'ignite_claim' : 'direct'
    const result = await c.identity.auth.register({
      email: body.email, password: body.password, displayName: body.display_name ?? null, source,
    })
    if (!result.ok) return err(result.error)
    // C12-3: consent is an append-only FACT of this moment — the registration
    // surface names the documents it relies on (contracts/legal, code not CMS)
    await c.deps.uow.withTransaction(async (tx) => {
      for (const consent of REGISTRATION_CONSENTS) {
        await asClient(tx).query(
          `INSERT INTO consent_facts (id, user_id, document_id, version, action, surface) VALUES ($1, $2, $3, $4, $5, 'register')`,
          [uuidv7(), result.value.userId, consent.document.id, consent.document.version, consent.action])
      }
    })
    if (body.claim) await c.identity.guestClaim.claim(result.value.userId, body.claim.type, body.claim.ref)
    const token = await c.identity.sessions.issue(result.value.userId, { stepUp: true, userAgent: getHeader(event, 'user-agent') ?? null })
    setSessionCookie(event, token)

    // Keep your corner (Release 1.3): a browsing identity present at registration is
    // claimed automatically — continuity, not account ceremony. A corner already kept
    // by someone else stays theirs (unique claim law).
    let corner: { merchants: number; saved: number } | null = null
    const visitorId = getVisitorId(event)
    if (visitorId) {
      await c.identity.guestClaim.claim(result.value.userId, 'visitor', visitorId)
      const owner = await c.identity.guestClaim.claimOwner('visitor', visitorId)
      if (owner === result.value.userId) corner = await c.engagement.cornerContents(visitorId)
    }
    return ok({ user_id: result.value.userId, corner })
  },
})
