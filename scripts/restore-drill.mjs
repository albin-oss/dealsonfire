/**
 * C12-3 — the restore drill. An ACTUAL pg_dump → restore into an isolated
 * target database, with the invariants recomputed on the RESTORED copy and
 * the wall-clock durations measured. A backup nobody has restored is a hope,
 * not a recovery plan.
 *
 * Guardrails (this script must be impossible to aim at production):
 *  - both source and target come ONLY from explicit env
 *    (NUXT_DRILL_SOURCE_URL, NUXT_DRILL_TARGET_URL) — no defaults, no .env
 *  - both must point at loopback hosts (127.0.0.1 / localhost / ::1)
 *  - the target database NAME must end in `_drill`
 *  - the target database is DROPPED and recreated — which is exactly why the
 *    name gate exists; the drop refuses any name that fails it
 *
 * Usage:
 *  NUXT_DRILL_SOURCE_URL=postgres://postgres:postgres@127.0.0.1:54329/dof_dev \
 *  NUXT_DRILL_TARGET_URL=postgres://postgres:postgres@127.0.0.1:54329/dof_drill \
 *  node scripts/restore-drill.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import pg from 'pg'

const PG_BIN_CANDIDATES = ['/Library/PostgreSQL/18/bin', '/opt/homebrew/bin', '/usr/local/bin']
const pgBin = (tool) => {
  for (const dir of PG_BIN_CANDIDATES) if (existsSync(`${dir}/${tool}`)) return `${dir}/${tool}`
  throw new Error(`${tool} not found in ${PG_BIN_CANDIDATES.join(', ')}`)
}

function guarded(name, raw) {
  if (!raw) throw new Error(`${name} is required — this drill runs only where it is explicitly aimed`)
  const url = new URL(raw)
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname))
    throw new Error(`${name} host '${url.hostname}' is not loopback — refusing (production guardrail)`)
  return url
}

const source = guarded('NUXT_DRILL_SOURCE_URL', process.env.NUXT_DRILL_SOURCE_URL)
const target = guarded('NUXT_DRILL_TARGET_URL', process.env.NUXT_DRILL_TARGET_URL)
const targetDb = target.pathname.replace(/^\//, '')
if (!targetDb.endsWith('_drill'))
  throw new Error(`target database '${targetDb}' must end in _drill — refusing to drop anything else`)
if (source.href === target.href) throw new Error('source and target are the same database')

const admin = new URL(target.href); admin.pathname = '/postgres'
const ms = () => process.hrtime.bigint()
const secs = (a, b) => Number(b - a) / 1e9

async function query(url, sql, params = []) {
  const client = new pg.Client({ connectionString: url.href })
  await client.connect()
  try { return (await client.query(sql, params)).rows } finally { await client.end() }
}

const dumpFile = new URL(`file://${process.cwd()}/.data/drill-dump.sql`).pathname

console.log(`DRILL source: ${source.hostname}:${source.port}${source.pathname}`)
console.log(`DRILL target: ${target.hostname}:${target.port}/${targetDb} (will be dropped + recreated)`)

// ————————————————————————————— 1. dump the source (the "backup")
const t0 = ms()
execFileSync(pgBin('pg_dump'), ['--no-owner', '--no-privileges', '-f', dumpFile, source.href], { stdio: 'inherit' })
const t1 = ms()
const dumpBytes = statSync(dumpFile).size
console.log(`dump: ${secs(t0, t1).toFixed(1)}s, ${(dumpBytes / 1024 / 1024).toFixed(1)} MiB`)

// ————————————————————————————— 2. recreate the isolated target and restore
await query(admin, `DROP DATABASE IF EXISTS ${JSON.stringify(targetDb).replaceAll('"', '')} WITH (FORCE)`).catch(async () => {
  await query(admin, `DROP DATABASE IF EXISTS ${targetDb}`)
})
await query(admin, `CREATE DATABASE ${targetDb}`)
const t2 = ms()
execFileSync(pgBin('psql'), ['-v', 'ON_ERROR_STOP=1', '-q', '-f', dumpFile, target.href], { stdio: 'inherit' })
const t3 = ms()
console.log(`restore: ${secs(t2, t3).toFixed(1)}s`)

// ————————————————————————————— 3. invariants on the RESTORED copy
const failures = []
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

// every table travelled, with every row
const countsSql = `
  SELECT relname AS table, n_live_tup FROM pg_stat_user_tables ORDER BY relname`
const exactCount = async (url, table) =>
  Number((await query(url, `SELECT count(*)::bigint AS n FROM ${table}`))[0].n)
const tables = (await query(source, `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)).map((r) => r.tablename)
const targetTables = (await query(target, `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)).map((r) => r.tablename)
check(`all ${tables.length} tables present in restore`, JSON.stringify(tables) === JSON.stringify(targetTables),
  `source ${tables.length}, target ${targetTables.length}`)

let rowDrift = 0, totalRows = 0
for (const t of tables) {
  const a = await exactCount(source, t)
  const b = await exactCount(target, t)
  totalRows += a
  if (a !== b) { rowDrift++; console.log(`    row drift in ${t}: source ${a}, target ${b}`) }
}
check(`row counts identical across all tables`, rowDrift === 0, `${totalRows} rows total`)

// L1 on the restored copy: every posting balances to zero
const l1 = await query(target, `
  SELECT posting_id, sum(delta_minor)::bigint AS s FROM ledger_entries GROUP BY posting_id HAVING sum(delta_minor) <> 0`)
check('L1 — every restored ledger posting balances to zero', l1.length === 0, `${l1.length} unbalanced`)

// L3 on the restored copy: cached balances ≡ recomputed entry sums
const l3 = await query(target, `
  SELECT a.id FROM ledger_accounts a
  WHERE a.balance_minor <> COALESCE((SELECT sum(e.delta_minor) FROM ledger_entries e WHERE e.account_id = a.id), 0)`)
check('L3 — restored cached balances ≡ recomputed entry sums', l3.length === 0, `${l3.length} drifted`)

// the person survives: accounts, credentials, sessions, recovery machinery
const users = await exactCount(target, 'users')
const creds = await exactCount(target, 'user_credentials')
check('identity — users and credentials restored', users > 0 && creds > 0, `${users} users, ${creds} credentials`)
const orphanCreds = await query(target, `
  SELECT count(*)::int AS n FROM user_credentials c LEFT JOIN users u ON u.id = c.user_id WHERE u.id IS NULL`)
check('identity — no credential orphaned from its user', Number(orphanCreds[0].n) === 0)

// the C12-3 surfaces travelled: guest keys, consent facts, email-change machine
for (const t of ['guest_tokens', 'consent_facts', 'email_changes', 'mail_journal', 'user_recovery_tokens']) {
  const present = targetTables.includes(t)
  check(`${t} table restored`, present, present ? `${await exactCount(target, t)} rows` : 'MISSING')
}

// a representative buyer-order read joins cleanly on the restored copy
const rep = await query(target, `
  SELECT o.order_number, s.name AS store_name, count(ol.line_no)::int AS lines
  FROM orders o JOIN stores s ON s.id = o.store_id JOIN order_lines ol ON ol.order_id = o.id
  GROUP BY o.id, o.order_number, s.name ORDER BY o.placed_at DESC LIMIT 1`)
check('representative order read (orders ⋈ stores ⋈ lines)', rep.length === 1,
  rep[0] ? `${rep[0].order_number} @ ${rep[0].store_name}, ${rep[0].lines} line(s)` : 'no orders in source')

// sequences travelled (a restore that resets sequences corrupts the next insert)
const seqs = await query(target, `SELECT count(*)::int AS n FROM information_schema.sequences WHERE sequence_schema = 'public'`)
const seqsSource = await query(source, `SELECT count(*)::int AS n FROM information_schema.sequences WHERE sequence_schema = 'public'`)
check('sequences restored', Number(seqs[0].n) === Number(seqsSource[0].n), `${seqs[0].n} sequences`)

// ————————————————————————————— 4. verdict + honesty
const total = secs(t0, t3)
console.log('')
console.log(`RECOVERY DURATION (dump ${secs(t0, t1).toFixed(1)}s + drop/create + restore ${secs(t2, t3).toFixed(1)}s): ${total.toFixed(1)}s wall clock`)
console.log('')
console.log('NOT PROVEN BY THIS DRILL (recorded honestly):')
console.log('  - restore onto a DIFFERENT machine/host (this drill restores into an isolated')
console.log('    database on the same server — media files on disk are not part of pg_dump)')
console.log('  - point-in-time recovery (no WAL archiving configured; this is full-dump only)')
console.log('  - restore at production scale (duration measured at current data volume)')
console.log('  - application boot against the restored copy under production gates')
console.log('')
if (failures.length > 0) {
  console.error(`DRILL FAILED: ${failures.length} invariant(s) broken: ${failures.join('; ')}`)
  process.exit(1)
}
console.log(`DRILL PASSED — the backup restores, and the restored world holds its invariants.`)
