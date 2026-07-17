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

const SEEN_COOKIE = 'dof_seen_at'
const LAST_VISIT_COOKIE = 'dof_last_visit'
const SESSION_GAP_SECONDS = 30 * 60

/**
 * "New since your last visit" (Release 0.7) — cookie-only last-seen tracking on the
 * existing visitor identity; no notification infrastructure. Two watermarks: dof_seen_at
 * rotates on every Home request; dof_last_visit only advances when a NEW session starts
 * (a 30-minute gap), so the unread marker stays stable while the visitor browses.
 * Returns the watermark to compare items against (null on a first visit).
 */
export function observeHomeVisit(event: H3Event): { lastVisit: string | null } {
  const now = new Date()
  const seenRaw = getCookie(event, SEEN_COOKIE)
  const lastVisitRaw = getCookie(event, LAST_VISIT_COOKIE)
  const seenAt = seenRaw ? new Date(seenRaw) : null
  const sessionExpired = !seenAt || Number.isNaN(seenAt.getTime())
    || now.getTime() - seenAt.getTime() > SESSION_GAP_SECONDS * 1000

  let lastVisit = lastVisitRaw && !Number.isNaN(new Date(lastVisitRaw).getTime()) ? lastVisitRaw : null
  if (sessionExpired) {
    // the previous session's last request becomes the new watermark
    lastVisit = seenAt && !Number.isNaN(seenAt.getTime()) ? seenAt.toISOString() : null
    if (lastVisit) {
      setCookie(event, LAST_VISIT_COOKIE, lastVisit, {
        httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
        maxAge: ONE_YEAR_SECONDS, path: '/',
      })
    }
  }
  setCookie(event, SEEN_COOKIE, now.toISOString(), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    maxAge: ONE_YEAR_SECONDS, path: '/',
  })
  return { lastVisit }
}
