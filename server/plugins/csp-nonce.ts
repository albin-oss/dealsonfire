/**
 * C12-2 — CSP nonce hardening (the TD-006 follow-up, production only).
 *
 * The baseline CSP (03.security-headers) carried `script-src 'unsafe-inline'`
 * as the honest cost of Nuxt's SSR hydration payload. This plugin closes that
 * hole for scripts: every rendered page gets a per-request nonce stamped onto
 * its inline scripts, and the page's CSP replaces 'unsafe-inline' with the
 * nonce (+ 'strict-dynamic' so Nuxt's loader chain keeps working). Styles keep
 * 'unsafe-inline' — Tailwind's runtime style injection remains the documented,
 * accepted cost (recorded, not hidden).
 *
 * API responses are untouched (no HTML, the baseline CSP suffices).
 */
import { randomBytes } from 'node:crypto'
import { getServerConfig } from '../utils/config'

export default defineNitroPlugin((nitroApp) => {
  if (!getServerConfig().isProduction) return

  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const nonce = randomBytes(16).toString('base64')
    const stamp = (chunks: string[]) => chunks.map((chunk) =>
      chunk.replace(/<script(?![^>]*\bsrc=)(?![^>]*\bnonce=)/g, `<script nonce="${nonce}"`)
           .replace(/<script(?=[^>]*\bsrc=)(?![^>]*\bnonce=)/g, `<script nonce="${nonce}"`))
    html.head = stamp(html.head)
    html.bodyAppend = stamp(html.bodyAppend)
    html.bodyPrepend = stamp(html.bodyPrepend)
    event.node.res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' https: data:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.stripe.com https://js.stripe.com",
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join('; '))
  })
})
