/**
 * C12-2 — the production-shape check (pure; the boot plugin throws on its
 * verdict, tests probe it directly). See server/plugins/production-gates.ts
 * for the law's prose.
 */
import { optionalEnv } from '@platform/config'

export function productionGateProblems(env: (key: string) => string = optionalEnv): string[] {
  const missing: string[] = []
  const wrong: string[] = []
  if (env('NUXT_IDENTITY_MODE') !== 'session') {
    wrong.push('NUXT_IDENTITY_MODE must be "session" in production (dev header identity is retired)')
  }
  if (env('NUXT_TRUST_PROXY') !== 'platform') {
    wrong.push('NUXT_TRUST_PROXY must be "platform" — production must declare that the deployment platform owns x-forwarded-for; direct internet exposure of this app is an unsupported posture')
  }
  for (const key of [
    'NUXT_DATABASE_URL', 'NUXT_CRON_SECRET',
    'NUXT_STRIPE_SECRET_KEY', 'NUXT_STRIPE_WEBHOOK_SECRET',
    'NUXT_RATE_LIMIT_HMAC_SECRET',
    'NUXT_RESEND_API_KEY', 'NUXT_MAIL_FROM', 'NUXT_MAIL_WEBHOOK_SECRET',
    'NUXT_OPS_ALARM_EMAIL', 'NUXT_APP_BASE_URL',
  ]) {
    if (!env(key)) missing.push(key)
  }
  if (env('NUXT_MAIL_PROVIDER') !== 'resend') {
    wrong.push('NUXT_MAIL_PROVIDER must name the real transport in production (sandbox mail may not silently operate)')
  }
  return [...missing.map((k) => `missing: ${k}`), ...wrong.map((w) => `wrong:   ${w}`)]
}
