/**
 * Server configuration — thin, typed view over environment, built on the PLATFORM
 * configuration readers (REVIEW-002 M-4: one config idiom on the platform; no ad-hoc
 * process.env access). Values follow Nuxt runtimeConfig naming (NUXT_*) but are read
 * directly so server utilities stay mountable outside Nitro (tests, tasks).
 */
import { optionalEnv } from '@platform/config'

export interface ServerConfig {
  databaseUrl: string
  cronSecret: string
  identityMode: 'dev' | 'session'
  isProduction: boolean
  /** Public origin for links in emails + WebAuthn (WP-R1-B1). */
  appBaseUrl: string
  webauthnRpId: string
  webauthnOrigin: string
  /** C4: no key, no Stripe — the sandbox twin runs everywhere keys are absent. */
  stripeSecretKey: string
  stripeWebhookSecret: string
  /** Slice 2: the browser half of the Payment Element (public by design). */
  stripePublishableKey: string
}

export function getServerConfig(): ServerConfig {
  const identityMode = optionalEnv('NUXT_IDENTITY_MODE', 'dev')
  if (identityMode !== 'dev' && identityMode !== 'session') {
    throw new Error(`NUXT_IDENTITY_MODE must be 'dev' or 'session', got "${identityMode}"`)
  }
  const appBaseUrl = optionalEnv('NUXT_APP_BASE_URL', 'http://localhost:3000')
  return {
    databaseUrl: optionalEnv('NUXT_DATABASE_URL', optionalEnv('DATABASE_URL')),
    cronSecret: optionalEnv('NUXT_CRON_SECRET'),
    identityMode,
    isProduction: optionalEnv('NODE_ENV') === 'production',
    appBaseUrl,
    webauthnRpId: optionalEnv('NUXT_WEBAUTHN_RP_ID', 'localhost'),
    webauthnOrigin: optionalEnv('NUXT_WEBAUTHN_ORIGIN', appBaseUrl),
    stripeSecretKey: assertNotLiveOutsideProduction(optionalEnv('NUXT_STRIPE_SECRET_KEY')),
    stripeWebhookSecret: optionalEnv('NUXT_STRIPE_WEBHOOK_SECRET'),
    stripePublishableKey: optionalEnv('NUXT_STRIPE_PUBLISHABLE_KEY'),
  }
}

/**
 * G9 — live Stripe credentials are REFUSED outside production: a live key in a
 * dev shell must crash the process before a single call is made. (Test-mode
 * keys pass everywhere; production accepts either mode by deliberate config.)
 */
function assertNotLiveOutsideProduction(key: string): string {
  if (key.startsWith('sk_live') && optionalEnv('NODE_ENV') !== 'production') {
    throw new Error('G9: a LIVE Stripe secret key is configured outside production — refused. Use a test-mode key (sk_test…).')
  }
  return key
}
