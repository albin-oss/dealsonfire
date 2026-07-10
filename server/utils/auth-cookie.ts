/** Session cookie helpers (WP-R1-B1): httpOnly, Secure (in prod), SameSite=Lax. */
import { setCookie, deleteCookie, type H3Event } from 'h3'
import { getServerConfig } from './config'
import { SESSION_COOKIE, SESSION_ABSOLUTE_MS } from '@domains/identity/application/session-service'

export function setSessionCookie(event: H3Event, token: string, opts: { persistent?: boolean } = {}): void {
  // remember-me: persistent (default) sets an absolute-lifetime cookie; when false the
  // cookie omits maxAge and dies with the browser session (WP-R1-B1 session experience).
  const persistent = opts.persistent ?? true
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: getServerConfig().isProduction,
    sameSite: 'lax',
    path: '/',
    ...(persistent ? { maxAge: SESSION_ABSOLUTE_MS / 1000 } : {}),
  })
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}
