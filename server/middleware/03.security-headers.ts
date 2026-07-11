/**
 * Baseline security response headers (PROMPT-005 hardening). Defense-in-depth that costs
 * nothing and every enterprise reviewer expects: MIME-sniffing off, clickjacking denied to
 * cross-origin framing, referrer trimmed on cross-origin, and HSTS in production only (never
 * in dev, where TLS is absent). Deliberately NO Content-Security-Policy here — a correct CSP
 * for the SSR app + Storybook needs its own hardening pass and is tracked in TECHNICAL_DEBT.
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
    setResponseHeaders(event, { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' })
  }
})
