#!/usr/bin/env node
/**
 * check:identity — WP-R1-B1 structural gate (T-12). Verifies:
 *  1. migration 0008 carries the identity quartet + the seven identity tables + email citext
 *  2. the manifest declares all identity tables
 *  3. registered event payloads = EXACTLY the two emitted events (emitted-only law)
 *  4. dev-identity is provably refused in production (the G-3 safety property, code-checked)
 *  5. the auth endpoint census is intact
 *  6. contract lock (sha of the auth schema + payloads)
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const fail = (m) => { console.error(`✗ check:identity — ${m}`); process.exit(1) }

// 1 — migration
const migration = read('db/migrations/0008_identity.sql')
for (const needle of [
  'CREATE TABLE identity_domain_events', 'CREATE TABLE identity_outbox_events',
  'CREATE TABLE identity_event_deliveries', 'CREATE TABLE identity_audit_logs',
  'CREATE TABLE users', 'CREATE TABLE user_credentials', 'CREATE TABLE user_passkeys',
  'CREATE TABLE user_sessions', 'CREATE TABLE user_recovery_tokens',
  'CREATE TABLE guest_tokens', 'CREATE TABLE identity_claims',
  'email         citext',
]) {
  if (!migration.includes(needle)) fail(`migration 0008 missing: ${needle}`)
}

// 2 — manifest
const manifest = JSON.parse(read('contracts/data/manifest.json'))
const tables = new Set(manifest.tables.map((t) => t.table))
for (const t of ['identity_domain_events', 'identity_outbox_events', 'identity_event_deliveries', 'identity_audit_logs',
  'users', 'user_credentials', 'user_passkeys', 'user_sessions', 'user_recovery_tokens', 'guest_tokens', 'identity_claims']) {
  if (!tables.has(t)) fail(`manifest missing table: ${t}`)
}

// 3 — exactly two emitted events registered
const payloads = read('contracts/schemas/events/identity-payloads.ts')
const registered = [...payloads.matchAll(/'(identity\.[a-z_.]+)':/g)].map((m) => m[1]).sort()
const expected = ['identity.session.revoked_all', 'identity.user.registered']
if (JSON.stringify(registered) !== JSON.stringify(expected)) fail(`registered payloads ${registered} ≠ ${expected}`)

// 4 — dev identity refuses production (the G-3 property, statically enforced)
const identityUtil = read('server/utils/identity.ts')
if (!/isProduction[\s\S]{0,200}return null/.test(identityUtil)) {
  fail('server/utils/identity.ts must refuse the dev adapter in production (return null)')
}

// 5 — endpoint census
const authDir = 'server/api/v1/auth'
const endpoints = []
function walk(rel) {
  for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
    if (e.isDirectory()) walk(`${rel}/${e.name}`)
    else if (e.name.endsWith('.ts')) endpoints.push(`${rel}/${e.name}`.replace(`${authDir}/`, ''))
  }
}
walk(authDir)
const expectedEndpoints = [
  'login.post.ts', 'logout-all.post.ts', 'logout.post.ts', 'register.post.ts', 'session.get.ts',
  'step-up.post.ts', 'verify-email.post.ts',
  'recovery/request.post.ts', 'recovery/reset.post.ts',
  'webauthn/authenticate.post.ts', 'webauthn/authentication-options.post.ts',
  'webauthn/registration-options.post.ts', 'webauthn/verify-registration.post.ts',
].sort()
if (JSON.stringify(endpoints.sort()) !== JSON.stringify(expectedEndpoints)) {
  fail(`auth endpoint census drift:\n  found: ${endpoints}\n  want:  ${expectedEndpoints}`)
}

// 6 — contract lock
const LOCK = 'contracts/locks/identity/batch1.lock.json'
const lockJson = JSON.stringify({
  'auth.schema.ts': createHash('sha256').update(read('contracts/schemas/identity/auth.schema.ts')).digest('hex'),
  'identity-payloads.ts': createHash('sha256').update(payloads).digest('hex'),
  events: expected,
}, null, 2) + '\n'
if (process.argv.includes('--update') || !existsSync(join(root, LOCK))) {
  mkdirSync(join(root, dirname(LOCK)), { recursive: true })
  writeFileSync(join(root, LOCK), lockJson)
  console.log(`✓ identity contract lock ${process.argv.includes('--update') ? 'updated' : 'created'}`)
} else if (read(LOCK) !== lockJson) {
  fail(`contract drift vs ${LOCK} — if intentional and additive, run: node scripts/check-identity.mjs --update`)
}

console.log('✓ check:identity clean (migration, manifest, events, dev-refuses-prod, endpoints, contract lock)')
