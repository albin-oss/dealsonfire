#!/usr/bin/env node
/**
 * check:operations — OPS-001A structural gate (the review-gate half; runtime invariants
 * live in the test suites). Verifies:
 *  1. migration 0006 carries the quartet + locations with L1's partial unique index
 *  2. the manifest declares the five operations tables
 *  3. registered event payloads = the domain's OPERATIONS_EVENT constants, exactly
 *  4. contract snapshots (contracts/locks/operations/) match the current contract
 *     sources — non-additive drift fails CI until the lock is deliberately regenerated
 *     with --update (CDC-001 §7 seed of check:contracts)
 *  5. the OpenAPI surface has exactly the Batch-1 paths/operations
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const fail = (msg) => { console.error(`✗ check:operations — ${msg}`); process.exit(1) }

// 1 — migration
const migration = read('db/migrations/0006_operations_core.sql')
for (const needle of [
  'CREATE TABLE operations_domain_events',
  'CREATE TABLE operations_outbox_events',
  'CREATE TABLE operations_event_deliveries',
  'CREATE TABLE operations_audit_logs',
  'CREATE TABLE locations',
  'CREATE UNIQUE INDEX uq_locations_default ON locations (business_id) WHERE is_default AND status = \'active\'',
  "GENERATED ALWAYS AS IDENTITY",
]) {
  if (!migration.includes(needle)) fail(`migration 0006 is missing: ${needle}`)
}

// 2 — manifest
const manifest = JSON.parse(read('contracts/data/manifest.json'))
const tables = new Set(manifest.tables.map((t) => t.table))
for (const t of ['operations_domain_events', 'operations_outbox_events', 'operations_event_deliveries', 'operations_audit_logs', 'locations']) {
  if (!tables.has(t)) fail(`manifest is missing table: ${t}`)
}

// 3 — event registration: payload keys === domain constants, exactly (M-6 lock discipline)
const payloadsSource = read('contracts/schemas/events/operations-payloads.ts')
const eventsSource = read('domains/operations/locations/domain/events.ts')
const registered = [...payloadsSource.matchAll(/'(operations\.[a-z_.]+)':/g)].map((m) => m[1]).sort()
const declared = [...eventsSource.matchAll(/'(operations\.[a-z_.]+)'/g)].map((m) => m[1]).sort()
const expected = ['operations.location.closed', 'operations.location.created', 'operations.location.updated']
if (JSON.stringify(registered) !== JSON.stringify(expected)) fail(`registered payloads ${registered} ≠ expected ${expected}`)
if (JSON.stringify([...new Set(declared)].sort()) !== JSON.stringify(expected)) fail(`domain event constants ${declared} ≠ expected ${expected}`)

// 4 — contract snapshots (sha256 of contract sources; --update regenerates deliberately)
const LOCK_PATH = 'contracts/locks/operations/batch1.lock.json'
const lockInput = {
  'contracts/schemas/operations/location.schema.ts': createHash('sha256').update(read('contracts/schemas/operations/location.schema.ts')).digest('hex'),
  'contracts/schemas/events/operations-payloads.ts': createHash('sha256').update(payloadsSource).digest('hex'),
  events: expected,
}
const lockJson = JSON.stringify(lockInput, null, 2) + '\n'
if (process.argv.includes('--update') || !existsSync(join(root, LOCK_PATH))) {
  mkdirSync(join(root, dirname(LOCK_PATH)), { recursive: true })
  writeFileSync(join(root, LOCK_PATH), lockJson)
  console.log(`✓ contract lock ${process.argv.includes('--update') ? 'updated' : 'created'}: ${LOCK_PATH}`)
} else if (read(LOCK_PATH) !== lockJson) {
  fail(`contract drift vs ${LOCK_PATH} — if the change is intentional and additive, regenerate with: node scripts/check-operations.mjs --update`)
}

// 5 — OpenAPI surface
const openapi = read('contracts/openapi/operations.v1.yaml')
const paths = [...openapi.matchAll(/^ {2}(\/[^\s:]+):/gm)].map((m) => m[1])
const ops = [...openapi.matchAll(/operationId: (\w+)/g)].map((m) => m[1]).sort()
if (paths.length !== 3) fail(`expected 3 OpenAPI paths, found ${paths.length}: ${paths}`)
if (JSON.stringify(ops) !== JSON.stringify(['closeLocation', 'createLocation', 'listLocations', 'updateLocation'])) {
  fail(`OpenAPI operations mismatch: ${ops}`)
}

console.log('✓ check:operations clean (migration, manifest, events, contract lock, OpenAPI)')
