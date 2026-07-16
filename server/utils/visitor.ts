/**
 * Visitor identity (Release 0.4) — the anonymous-first engagement actor. A uuidv7 in a
 * long-lived httpOnly cookie: enough to make toggles idempotent and saves/follows
 * durable, pseudonymous by design (P1 in the manifest), and claimable into a real
 * account later through the identity claim seam. Minted only when the visitor first
 * ENGAGES — reads never set cookies (no tracking-by-default).
 */
import type { H3Event } from 'h3'
import { getCookie, setCookie } from 'h3'
import { uuidv7, isUuid } from '@platform/uuid'

export const VISITOR_COOKIE = 'dof_visitor'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/** Read-only: the identity if one exists (feed reads, snapshots). Never mints. */
export function getVisitorId(event: H3Event): string | null {
  const value = getCookie(event, VISITOR_COOKIE)
  return value && isUuid(value) ? value : null
}

/** Engagement actions mint on first use — the cookie is the visitor's shelf key. */
export function getOrCreateVisitorId(event: H3Event): string {
  const existing = getVisitorId(event)
  if (existing) return existing
  const id = uuidv7()
  setCookie(event, VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ONE_YEAR_SECONDS,
    path: '/',
  })
  return id
}
