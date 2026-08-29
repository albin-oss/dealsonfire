/**
 * /robots.txt (LS-8) — a courtesy to crawlers, NEVER access control: every
 * private surface listed is already protected by authorization law. Served
 * dynamically so the Sitemap line carries the real absolute origin.
 */
import { defineEventHandler, getRequestURL, setResponseHeader } from 'h3'

export default defineEventHandler((event) => {
  const origin = getRequestURL(event).origin
  setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  setResponseHeader(event, 'Cache-Control', 'public, max-age=3600')
  return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /account
Disallow: /cart
Disallow: /checkout
Disallow: /o/
Disallow: /login
Disallow: /register
Disallow: /forgot
Disallow: /reset
Disallow: /verify
Disallow: /confirm-email-change
Disallow: /undo-email-change
Disallow: /search
Sitemap: ${origin}/sitemap.xml
`
})
