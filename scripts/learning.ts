/**
 * The Learning Ledger runner (Release 1.4) — executes scripts/learning.sql section by
 * section inside a READ-ONLY transaction and prints each result. Repeatable, safe, and
 * definition-stable: the metrics live in the SQL file under version control.
 *
 *   npm run learning                        → demo database (dev:demo)
 *   DOF_LEARNING_DATABASE_URL=… npm run learning   → any environment
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const DEFAULT_URL = 'postgres://postgres:postgres@127.0.0.1:54329/dof_dev'
const url = process.env.DOF_LEARNING_DATABASE_URL ?? process.env.NUXT_DATABASE_URL ?? DEFAULT_URL

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'learning.sql'), 'utf8')

/** Split on `-- @section <title>` markers; each section is one statement. */
export function parseSections(sql: string): Array<{ title: string; query: string }> {
  const sections: Array<{ title: string; query: string }> = []
  const parts = sql.split(/^-- @section /m).slice(1)
  for (const part of parts) {
    const newline = part.indexOf('\n')
    const title = part.slice(0, newline).trim()
    const query = part.slice(newline + 1).trim().replace(/;\s*$/, '')
    sections.push({ title, query })
  }
  return sections
}

function printTable(rows: Array<Record<string, unknown>>): void {
  if (rows.length === 0) { console.log('  (no rows)'); return }
  const cols = Object.keys(rows[0]!)
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '∅').length)))
  console.log('  ' + cols.map((c, i) => c.padEnd(widths[i]!)).join('  '))
  for (const row of rows) {
    console.log('  ' + cols.map((c, i) => String(row[c] ?? '∅').padEnd(widths[i]!)).join('  '))
  }
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    await client.query('BEGIN TRANSACTION READ ONLY')
    console.log(`\nDOF LEARNING LEDGER · ${new Date().toISOString().slice(0, 16)}Z`)
    console.log(`database: ${url.replace(/\/\/[^@]*@/, '//***@')}\n`)
    for (const section of parseSections(source)) {
      console.log(`— ${section.title}`)
      const { rows } = await client.query(section.query)
      printTable(rows)
      console.log('')
    }
    await client.query('ROLLBACK')
  } finally {
    await client.end()
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  void main().catch((error) => { console.error(error.message); process.exit(1) })
}
