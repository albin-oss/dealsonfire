/** ADR-004 CI gates verified against intentional bad fixtures (PROMPT 009 §6). */
import { describe, it, expect } from 'vitest'
 
// @ts-ignore — plain .mjs module shared with the CI script
import {
  lintMigrationNames, lintMigrationSql, tablesCreatedBy,
  checkManifestCompleteness, checkEventRegistryCompatibility,
} from '../../scripts/data-constitution/lint.mjs'
import { TABLE_MANIFEST, manifestTableNames } from '@contracts/data/manifest'
import { KERNEL_EVENT_PAYLOADS } from '@contracts/schemas/events/payloads'
import { COMMERCE_EVENT_PAYLOADS } from '@contracts/schemas/events/commerce-payloads'
import { EVENT } from '@domains/merchant/core/domain/events'
import registryLock from '../../contracts/schemas/events/registry.lock.json'

const MERCHANT_OWNED = new Map([['stores', 'merchant'], ['users', 'identity'], ['businesses', 'merchant']])

describe('migration lint — bad fixtures are caught', () => {
  it('rejects bad filenames and duplicates', () => {
    expect(lintMigrationNames(['0001_ok.sql', 'stuff.sql'])).toHaveLength(1)
    expect(lintMigrationNames(['0001_a.sql', '0001_b.sql'])).toHaveLength(1)
    expect(lintMigrationNames(['0001_a.sql', '0002_b.sql'])).toHaveLength(0)
  })

  it('rejects timestamp without time zone; allows timestamptz', () => {
    expect(lintMigrationSql('x.sql', 'CREATE TABLE t (a timestamp)', null)).toHaveLength(1)
    expect(lintMigrationSql('x.sql', 'CREATE TABLE t (a timestamptz, b timestamp with time zone)', null)).toHaveLength(0)
  })

  it('rejects native enums', () => {
    expect(lintMigrationSql('x.sql', "CREATE TYPE mood AS ENUM ('ok')", null).some((v) => v.includes('ENUM'))).toBe(true)
  })

  it('rejects ON DELETE CASCADE', () => {
    const sql = 'CREATE TABLE t (b uuid REFERENCES businesses(id) ON DELETE CASCADE)'
    expect(lintMigrationSql('x.sql', sql, null).some((v) => v.includes('CASCADE'))).toBe(true)
  })

  it('rejects float and numeric money', () => {
    expect(lintMigrationSql('x.sql', 'CREATE TABLE t (price_amount real)', null).length).toBeGreaterThan(0)
    expect(lintMigrationSql('x.sql', 'CREATE TABLE t (total_amount numeric(10,2))', null).length).toBeGreaterThan(0)
    expect(lintMigrationSql('x.sql', 'CREATE TABLE t (price_amount bigint)', null)).toHaveLength(0)
  })

  it('rejects cross-domain foreign keys, allows in-domain ones', () => {
    const cross = 'CREATE TABLE stores (user_id uuid REFERENCES users (id))'
    expect(lintMigrationSql('x.sql', cross, MERCHANT_OWNED).some((v) => v.includes('cross-domain'))).toBe(true)
    const inDomain = 'CREATE TABLE stores (business_id uuid REFERENCES businesses (id))'
    expect(lintMigrationSql('x.sql', inDomain, MERCHANT_OWNED)).toHaveLength(0)
  })

  it('rejects DROP/RENAME without a deprecation marker, allows marked ones', () => {
    expect(lintMigrationSql('x.sql', 'ALTER TABLE t DROP COLUMN old', null).some((v) => v.includes('deprecation'))).toBe(true)
    expect(lintMigrationSql('x.sql', '-- deprecation: ADR-XXX expand/contract step 3\nALTER TABLE t DROP COLUMN old', null)).toHaveLength(0)
  })

  it('ignores SQL keywords inside comments and string literals', () => {
    const sql = "-- this comment mentions timestamp and ON DELETE CASCADE\nSELECT 'CREATE TABLE fake (a timestamp)'"
    expect(lintMigrationSql('x.sql', sql, null)).toHaveLength(0)
  })
})

describe('manifest completeness', () => {
  it('flags unmanifested tables and stale manifest entries', () => {
    const manifest = [{ table: 'known', owner: 'merchant', class: 'aggregate', pii_tier: 'P0', retention: 'permanent', delete_class: 'tombstone' }]
    const migrations = { '0001_x.sql': 'CREATE TABLE known (id uuid); CREATE TABLE unknown_table (id uuid)' }
    const violations = checkManifestCompleteness(manifest, migrations)
    expect(violations.some((v: string) => v.includes('unknown_table'))).toBe(true)
  })

  it('flags manifest entries missing required fields', () => {
    const manifest = [{ table: 'known', owner: 'merchant', class: 'aggregate' }] // missing pii/retention/delete
    const violations = checkManifestCompleteness(manifest, { '0001_x.sql': 'CREATE TABLE known (id uuid)' })
    expect(violations.length).toBeGreaterThanOrEqual(3)
  })

  it('skips partitions and runner-created tables', () => {
    expect(tablesCreatedBy('CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT')).toHaveLength(0)
  })

  it('the REAL manifest covers every kernel table with complete fields', () => {
    for (const entry of TABLE_MANIFEST) {
      expect(entry.owner, entry.table).toBeTruthy()
      expect(entry.pii_tier, entry.table).toMatch(/^P[0-3]$/)
      expect(entry.retention, entry.table).toBeTruthy()
      expect(entry.delete_class, entry.table).toBeTruthy()
    }
    expect(manifestTableNames().size).toBe(49) // +5 operations (OPS-001A) +11 identity (R1-B1) +1 onboarding (MER-002) +2 catalog attrs (PROMPT-016) +1 media (UX-AUTHOR) +1 listings (CS1) +1 deals (R0.3) +3 engagement (R0.4) +2 sparks (R0.6)
  })
})

describe('event schema registry compatibility (ADR-003 §4)', () => {
  const currentVersions = Object.fromEntries(
    [...Object.keys(KERNEL_EVENT_PAYLOADS), ...Object.keys(COMMERCE_EVENT_PAYLOADS)].map((k) => [k, 1]),
  )

  it('every EVENT constant has a registered payload schema', () => {
    for (const eventType of Object.values(EVENT)) {
      expect(KERNEL_EVENT_PAYLOADS[eventType], `missing payload schema for ${eventType}`).toBeDefined()
    }
  })

  it('the lock matches the current registry (no removals, no version decreases)', () => {
    expect(checkEventRegistryCompatibility(registryLock.events, currentVersions)).toHaveLength(0)
  })

  it('catches a removed event type and a version decrease', () => {
    const removed = checkEventRegistryCompatibility({ 'merchant.store.published': 1 }, {})
    expect(removed.some((v: string) => v.includes('removed'))).toBe(true)
    const downgraded = checkEventRegistryCompatibility({ 'x.y.z': 2 }, { 'x.y.z': 1 })
    expect(downgraded.some((v: string) => v.includes('decreased'))).toBe(true)
  })
})

describe('immutability grants are represented in deploy SQL (ADR-004 C4)', () => {
  it('the grants file revokes UPDATE/DELETE and grants only SELECT/INSERT on both tables', async () => {
    const { readFileSync } = await import('node:fs')
    const sql = readFileSync('db/grants/immutable-tables.sql', 'utf8')
    expect(sql).toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs, domain_events, commerce_audit_logs, commerce_domain_events, operations_audit_logs, operations_domain_events, identity_audit_logs, identity_domain_events FROM \{\{APP_ROLE\}\}/)
    expect(sql).toMatch(/GRANT SELECT, INSERT ON audit_logs, domain_events, commerce_audit_logs, commerce_domain_events, operations_audit_logs, operations_domain_events, identity_audit_logs, identity_domain_events TO \{\{APP_ROLE\}\}/)
    expect(sql).toMatch(/pg_inherits/) // partitions covered
    expect(sql).not.toMatch(/GRANT[^;]*(UPDATE|DELETE)[^;]*ON audit_logs/)
  })
})
