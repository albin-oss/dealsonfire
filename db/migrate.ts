/**
 * Forward-only migration runner (BLUEPRINT-001 §1: db/migrations, numbered).
 * Each migration runs in its own transaction and is recorded in schema_migrations with a
 * checksum — editing an already-applied file is detected and refused (ADR-004 rule 17:
 * amendments after any environment applied a migration must be NEW migrations).
 * Usage: DATABASE_URL=… tsx db/migrate.ts   (also importable — used by tests/CI)
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import pg from 'pg'

const DEFAULT_MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export async function migrate(databaseUrl: string, migrationsDir: string = DEFAULT_MIGRATIONS_DIR): Promise<string[]> {
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  const applied: string[] = []
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    )
    await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text')
    // Serialize concurrent runners (e.g. parallel deploys)
    await client.query('SELECT pg_advisory_lock(727001)')
    const done = new Map(
      (await client.query('SELECT name, checksum FROM schema_migrations')).rows.map(
        (r: { name: string; checksum: string | null }) => [r.name, r.checksum] as const,
      ),
    )
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8')
      const checksum = sha256(sql)
      if (done.has(file)) {
        const recorded = done.get(file)
        if (recorded && recorded !== checksum) {
          throw new Error(
            `Migration ${file} was modified after being applied (checksum mismatch). ` +
            `ADR-004 rule 17: write a new migration instead.`,
          )
        }
        continue
      }
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [file, checksum])
        await client.query('COMMIT')
        applied.push(file)
      } catch (error) {
        await client.query('ROLLBACK')
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error })
      }
    }
    return applied
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => {})
    await client.end()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.DATABASE_URL ?? process.env.NUXT_DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL (or NUXT_DATABASE_URL) is required')
    process.exit(1)
  }
  migrate(url)
    .then((applied) => console.log(applied.length ? `applied: ${applied.join(', ')}` : 'up to date'))
    .catch((error) => {
      console.error(error.message)
      process.exit(1)
    })
}
