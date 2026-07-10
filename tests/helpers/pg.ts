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
      commerce_event_deliveries, commerce_outbox_events, commerce_domain_events, commerce_audit_logs,
      product_media, product_variants, products,
      operations_event_deliveries, operations_outbox_events, operations_domain_events, operations_audit_logs, locations,
      identity_event_deliveries, identity_outbox_events, identity_domain_events, identity_audit_logs,
      user_sessions, user_recovery_tokens, user_passkeys, user_credentials, guest_tokens, identity_claims, users,
      event_deliveries, outbox_events, domain_events, audit_logs,
      request_idempotency_keys, business_entitlements, brand_kits,
      storefront_configs, staff_memberships, stores, store_handles,
      businesses, merchant_accounts
    CASCADE
  `)
}
