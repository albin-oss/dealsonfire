import type pg from 'pg'
import { buildContainer, type Container } from '../../server/utils/container'

/** Merchant's platform-machinery table set (K1) — for tests constructing dispatchers directly. */
export const MERCHANT_OUTBOX_TABLES = {
  outboxTable: 'outbox_events',
  eventsTable: 'domain_events',
  deliveriesTable: 'event_deliveries',
}

export function testDatabaseUrl(): string {
  const url = process.env.DOF_TEST_DATABASE_URL
  if (!url) throw new Error('global setup did not run (DOF_TEST_DATABASE_URL missing)')
  return url
}

export function newTestContainer(): Container {
  return buildContainer(testDatabaseUrl())
}

/** Reset business data between tests; keeps the migrated schema + capability seed. */
export async function truncateAll(pool: pg.Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      payments_event_deliveries, payments_outbox_events, payments_domain_events, payments_audit_logs,
      payment_facts, payment_intents, ledger_entries, ledger_accounts, provider_events, provider_operations, payment_disputes, reconciliation_runs, reconciliation_items, merchant_payment_profiles,
      orders_event_deliveries, orders_outbox_events, orders_domain_events, orders_audit_logs,
      order_timeline, order_lines, orders, order_counters, checkout_attempts,
      cart_lines, carts, reservations, stock_ledger, stock_items,
      return_case_lines, return_cases, fulfillment_case_lines, fulfillment_cases, shipping_profiles,
      commerce_event_deliveries, commerce_outbox_events, commerce_domain_events, commerce_audit_logs,
      spark_reactions, sparks, deal_reactions, deal_saves, deals, listings, product_media, product_variants, products, media_assets,
      operations_event_deliveries, operations_outbox_events, operations_domain_events, operations_audit_logs, locations,
      identity_event_deliveries, identity_outbox_events, identity_domain_events, identity_audit_logs,
      user_sessions, user_recovery_tokens, user_passkeys, user_credentials, guest_tokens, identity_claims, users,
      event_deliveries, outbox_events, domain_events, audit_logs,
      mail_journal, mail_bounces, rate_limit_buckets, webauthn_challenges, abuse_reports, email_changes, consent_facts,
      attention_facts, attention_facts,
      request_idempotency_keys, business_entitlements, brand_kits,
      storefront_configs, staff_memberships, store_follows, stores, store_handles,
      businesses, merchant_accounts, onboarding_profiles
    CASCADE
  `)
}
