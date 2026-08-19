/**
 * Integration global setup (DECISIONS D-09): boots a REAL PostgreSQL.
 *  - TEST_DATABASE_URL set (CI postgres service) → use it directly.
 *  - otherwise → embedded-postgres (real PG binaries, no Docker required).
 * Runs migrations + capability seed once; workers inherit DOF_TEST_DATABASE_URL.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from '../../db/migrate'
import { seed } from '../../db/seed'

export default async function setup(): Promise<() => Promise<void>> {
  let url = process.env.TEST_DATABASE_URL
  let teardown: () => Promise<void> = async () => {}

  if (!url) {
    const { default: EmbeddedPostgres } = await import('embedded-postgres')
    // embedded-postgres registers async-exit-hook, whose 'beforeExit' handler
    // re-exits the process with code 0 — CLOBBERING vitest's failing exit code
    // (a red suite reported green to the sweep). A filter that returns true
    // swallows that event; our teardown stops PG explicitly, and the signal
    // hooks (SIGINT/SIGTERM crash cleanup) stay armed. Honest exits > tidy exits.
    // @ts-expect-error — async-exit-hook ships no types; the shape is asserted below
    const { default: exitHook } = await import('async-exit-hook')
    const hook = exitHook as unknown as { hookEvent: (e: string, c: number | undefined, f: () => boolean) => void }
    hook.hookEvent('beforeExit', 0, () => true)
    hook.hookEvent('exit', undefined, () => true) // same swallow: the sync path calls the async hook without its callback
    const port = 54000 + Math.floor(Math.random() * 1000)
    const dataDir = mkdtempSync(join(tmpdir(), 'dof-pg-'))
    const pg = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: 'postgres',
      password: 'postgres',
      port,
      persistent: false,
    })
    await pg.initialise()
    await pg.start()
    await pg.createDatabase('dof_test')
    url = `postgres://postgres:postgres@127.0.0.1:${port}/dof_test`
    teardown = async () => {
      await pg.stop()
    }
  }

  await migrate(url)
  await seed(url)
  process.env.DOF_TEST_DATABASE_URL = url
  return teardown
}
