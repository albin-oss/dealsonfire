/**
 * The production dispatch lane (Release 1.5 — First Light). Regression for the audit
 * find: the cron endpoint drained only merchant+commerce, so identity and operations
 * events would NEVER leave their outboxes in production. Now all four quartets drain.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('outbox dispatch (First Light)', () => {
  it('drains ALL FOUR quartets — identity events included', async () => {
    // a registration writes identity events into the identity outbox
    await http.request('POST', '/api/v1/auth/register', {
      body: { email: `d-${uuidv7()}@example.com`, password: 'a long passphrase' },
    })
    const { rows: pendingBefore } = await container.pool.query(
      `SELECT count(*)::int AS n FROM identity_outbox_events WHERE status = 'pending'`)
    expect(Number(pendingBefore[0]!.n)).toBeGreaterThan(0)

    // the cron lane drains it (open in test: no secret, not production)
    const res = await http.request('GET', '/api/internal/outbox-dispatch')
    expect(res.status).toBe(200)
    expect(res.body.failed).toBe(0)
    expect(res.body.dispatched).toBeGreaterThan(0)

    const { rows: pendingAfter } = await container.pool.query(
      `SELECT count(*)::int AS n FROM identity_outbox_events WHERE status = 'pending'`)
    expect(Number(pendingAfter[0]!.n)).toBe(0)
  })
})
