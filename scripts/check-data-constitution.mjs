#!/usr/bin/env node
/**
 * ADR-004 CI gate (closing deliverable 2): migration lint + table-manifest gate.
 * Event-registry compatibility and DB-level manifest verification run in the test suites
 * (they need the TS registry / a live database respectively).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  lintMigrationNames, lintMigrationSql, checkManifestCompleteness,
} from './data-constitution/lint.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const MIGRATIONS_DIR = join(ROOT, 'db', 'migrations')
const MANIFEST_PATH = join(ROOT, 'contracts', 'data', 'manifest.json')

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')).tables
const ownerByTable = new Map(manifest.map((t) => [t.table, t.owner]))

const names = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
const sqlByName = Object.fromEntries(names.map((n) => [n, readFileSync(join(MIGRATIONS_DIR, n), 'utf8')]))

const violations = [
  ...lintMigrationNames(names),
  ...names.flatMap((n) => lintMigrationSql(n, sqlByName[n], ownerByTable)),
  ...checkManifestCompleteness(manifest, sqlByName),
]

if (violations.length) {
  console.error('Data-constitution violations (ADR-004):')
  for (const v of violations) console.error('  ✗ ' + v)
  process.exit(1)
}
console.log(`✓ data constitution clean (${names.length} migrations, ${manifest.length} manifested tables)`)
