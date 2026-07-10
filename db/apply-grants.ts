/**
 * Deploy-time grant applier (ADR-004 C4). Substitutes the application role into
 * db/grants/immutable-tables.sql and executes it. Run after every migration deploy
 * (new audit partitions need the same protections — the grants file loops them).
 * Usage: DATABASE_URL=… APP_ROLE=dof_app tsx db/apply-grants.ts
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const GRANTS_FILE = join(dirname(fileURLToPath(import.meta.url)), 'grants', 'immutable-tables.sql')
const ROLE_RE = /^[a-z_][a-z0-9_]*$/

export async function applyGrants(databaseUrl: string, appRole: string): Promise<void> {
  if (!ROLE_RE.test(appRole)) throw new Error(`invalid role name: ${appRole}`)
  const sql = readFileSync(GRANTS_FILE, 'utf8').replaceAll('{{APP_ROLE}}', appRole)
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query(sql)
  } finally {
    await client.end()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.DATABASE_URL ?? process.env.NUXT_DATABASE_URL
  const role = process.env.APP_ROLE
  if (!url || !role) {
    console.error('DATABASE_URL and APP_ROLE are required')
    process.exit(1)
  }
  applyGrants(url, role)
    .then(() => console.log(`immutability grants applied for role ${role}`))
    .catch((error) => {
      console.error(error.message)
      process.exit(1)
    })
}
