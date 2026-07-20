/**
 * Baseline security response headers (PROMPT-005 hardening). Defense-in-depth that costs
 * nothing and every enterprise reviewer expects: MIME-sniffing off, clickjacking denied to
 * cross-origin framing, referrer trimmed on cross-origin, and HSTS in production only (never
 * in dev, where TLS is absent). CSP ships production-only (TD-006 closed, Release 1.5):
 * 'unsafe-inline' script/style is the honest cost of Nuxt's SSR hydration payload and
 * Tailwind runtime styles today; everything else is locked to self (+ https images for
 * the Media Port's blob URLs).
 * Applies to every response (API + pages); it changes no business behavior.
 */
import { defineEventHandler, setResponseHeaders } from 'h3'
import { getServerConfig } from '../utils/config'

export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-DNS-Prefetch-Control': 'off',
  })
  // HSTS only where TLS is real. Two years, subdomains, preload-eligible.
  if (getServerConfig().isProduction) {
    setResponseHeaders(event, {
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' https: data:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    })
  }
})
