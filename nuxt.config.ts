import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

// Module 1 (Merchant Kernel) is API-first: the app/ layer ships a minimal shell.
// Domain code lives in domains/ and is framework-free (BLUEPRINT-001 §1).
// UI-FOUNDATION-001: the design system lives in app/design-system — explicit imports
// via the @ds public index, no auto-import magic (DESIGN-SYSTEM-001 §1.2).
export default defineNuxtConfig({
  compatibilityDate: '2026-07-01',
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
      meta: [{ name: 'theme-color', content: '#ea580c' }],
    },
  },
  future: { compatibilityVersion: 4 },
  css: ['~/design-system/tokens/theme.css'],
  // The Ignite ceremony is client-rendered: resume() reads the local draft in setup,
  // so re-entry FIRST-PAINTS at the resumed step (no welcome flash, no swap needed).
  routeRules: {
    '/ignite': { ssr: false },
    // 'Discover' grew into the living front page — permanent move (Release 0.7)
    '/discover': { redirect: { to: '/home', statusCode: 301 } },
  },
  // Dev only: the app-manifest poll 404s under `nuxt dev` (upstream quirk) and spams the
  // console; nothing in dev needs outdated-build detection. Production keeps the manifest.
  $development: { experimental: { appManifest: false } },
  vite: { plugins: [tailwindcss()] },
  // Public: only the identity MODE (not a secret) — the auth route guard enforces sessions
  // only when the server actually requires them (dev mode leaves the browser open, R1-B1).
  runtimeConfig: {
    public: { identityMode: process.env.NUXT_IDENTITY_MODE ?? 'dev' },
  },
  alias: {
    '@ds': fileURLToPath(new URL('./app/design-system', import.meta.url)),
    '@domains': fileURLToPath(new URL('./domains', import.meta.url)),
    '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    '@contracts': fileURLToPath(new URL('./contracts', import.meta.url)),
    '@platform': fileURLToPath(new URL('./platform', import.meta.url)),
  },
  // Server env (NUXT_DATABASE_URL, NUXT_CRON_SECRET, NUXT_IDENTITY_MODE) is read via
  // server/utils/config.ts (process.env) so utilities stay mountable outside Nitro —
  // deliberately NOT duplicated in runtimeConfig to prevent two-sources-of-truth drift (L-3).
  typescript: { strict: true },
})
