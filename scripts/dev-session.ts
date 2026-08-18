/**
 * Dev server in SESSION identity mode (C12-3 experience review): the same
 * persistent dev world as dev-demo.ts, but authentication runs the production
 * path — real session cookies, CSRF origin assertion, /account and the
 * email-change journey all live. No seeding here: dev-demo owns the world.
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PG_PORT = 54329
const DB_URL = `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/dof_dev`

async function bootPostgres(): Promise<void> {
  const { default: EmbeddedPostgres } = await import('embedded-postgres')
  const dataDir = join(ROOT, '.data', 'dev-pg')
  mkdirSync(dataDir, { recursive: true })
  const server = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PG_PORT, persistent: true,
  })
  try { await server.initialise() } catch { /* already initialised */ }
  try { await server.start() } catch { /* already running (external boot) */ }
  const stop = async () => { try { await server.stop() } catch { /* already down */ } }
  process.on('SIGINT', () => void stop().then(() => process.exit(0)))
  process.on('SIGTERM', () => void stop().then(() => process.exit(0)))
}

await bootPostgres()
const child = spawn('node', ['node_modules/nuxt/bin/nuxt.mjs', 'dev', '--cwd', ROOT], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, NUXT_DATABASE_URL: DB_URL, NUXT_IDENTITY_MODE: 'session' },
})
child.on('exit', (code) => process.exit(code ?? 0))
