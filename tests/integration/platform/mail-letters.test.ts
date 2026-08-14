/**
 * C12-1 "The Letters Arrive" — the hostile matrix for §7 mail.
 *
 * The binding semantics under attack: exactly-once COMPOSITION (journal unique
 * key), IDEMPOTENT provider handoff (stable key across every retry and crash
 * window), honest OUTCOMES (bounce facts, derived suppression, critical
 * letters never silently dropped). Every scenario must converge without a
 * duplicate handoff, a lost logical letter, a hidden failure, or a
 * transaction held across network I/O.
 */
import { createHmac } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { journalLetter, MailJournalDriver } from '@platform/mail-journal'
import { RetryableMailError, PermanentMailError, type MailMessage, type MailPort } from '@platform/mail'
import { JournalingEmailProvider } from '@domains/identity/infrastructure/email'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

const WEBHOOK_SECRET = 'whsec_' + Buffer.from('a-test-signing-key-32-bytes-long!').toString('base64')

/** A provider twin with scripted behavior: records every handoff + its key. */
class ScriptedMailPort implements MailPort {
  readonly name = 'provider' as const
  readonly handoffs: MailMessage[] = []
  script: Array<'ok' | 'retryable' | 'permanent' | 'accept-then-crash'> = []
  async send(message: MailMessage): Promise<{ providerRef: string | null }> {
    this.handoffs.push(message)
    const behavior = this.script.shift() ?? 'ok'
    if (behavior === 'retryable') throw new RetryableMailError('provider 5xx (scripted)')
    if (behavior === 'permanent') throw new PermanentMailError('provider 422 (scripted)')
    return { providerRef: `msg-${this.handoffs.length}` }
  }
}

const inTx = <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
  container.deps.uow.withTransaction(fn as never) as Promise<T>

function driver(port: MailPort, alarms: string[] = []) {
  return new MailJournalDriver({ pool: container.pool, mail: port, alarm: (m) => alarms.push(m) })
}

async function journalOne(overrides: Partial<Parameters<typeof journalLetter>[1]> = {}) {
  const letter = {
    consumer: 'notify.test', dedupRef: uuidv7(), to: 'rosa@maker.example',
    subject: 'A letter', body: 'Hello from the workshop.', critical: false, ...overrides,
  }
  await inTx((tx) => journalLetter(tx as never, letter))
  return letter
}

const journalRows = async () =>
  (await container.pool.query(`SELECT consumer, recipient, state, attempts, provider_ref, critical FROM mail_journal ORDER BY created_at`)).rows

function svixHeaders(rawBody: string, id = `evt-${uuidv7()}`) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const key = Buffer.from(WEBHOOK_SECRET.replace(/^whsec_/, ''), 'base64')
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64')
  return { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}`, 'content-type': 'application/json' }
}

beforeAll(async () => {
  process.env.NUXT_MAIL_WEBHOOK_SECRET = WEBHOOK_SECRET
  container = newTestContainer()
  setContainer(container)
  http = await startTestApp()
})
afterAll(async () => {
  await http.close(); setContainer(null); await container.shutdown()
  delete process.env.NUXT_MAIL_WEBHOOK_SECRET
})
beforeEach(async () => {
  await truncateAll(container.pool)
})

describe('C12-1 — §7 for letters: journal, drive, converge', () => {
  it('crash after journal commit, before the provider call: the recovery drive sends exactly once', async () => {
    await journalOne() // the "crash": journaled, never driven by its own process
    const port = new ScriptedMailPort()
    const first = await driver(port).drivePending()
    expect(first.sent).toBe(1)
    const again = await driver(port).drivePending()
    expect(again.sent + again.retried + again.failed).toBe(0) // nothing left
    expect(port.handoffs).toHaveLength(1)
    expect((await journalRows())[0]).toMatchObject({ state: 'sent', provider_ref: 'msg-1' })
  })

  it('crash after provider acceptance, before the outcome write: the retry reuses the SAME idempotency key', async () => {
    await journalOne()
    const port = new ScriptedMailPort()
    await driver(port).drivePending()
    // simulate the crash window: the provider accepted, our outcome write was lost
    await container.pool.query(`UPDATE mail_journal SET state = 'pending', provider_ref = NULL, sent_at = NULL, updated_at = now() - interval '10 minutes'`)
    await driver(port).drivePending()
    expect(port.handoffs).toHaveLength(2)
    // the provider's idempotency window collapses the two handoffs into ONE email
    expect(port.handoffs[0]!.idempotencyKey).toBeTruthy()
    expect(port.handoffs[1]!.idempotencyKey).toBe(port.handoffs[0]!.idempotencyKey)
  })

  it('a repeated domain event composes nothing twice (journal unique key)', async () => {
    const letter = await journalOne()
    await inTx((tx) => journalLetter(tx as never, letter)) // replay: same consumer+ref+recipient
    expect(await journalRows()).toHaveLength(1)
  })

  it('a 5xx storm retries under backoff and eventually lands; the key never changes', async () => {
    await journalOne()
    const port = new ScriptedMailPort()
    port.script = ['retryable', 'retryable', 'ok']
    const d = driver(port)
    expect((await d.drivePending()).retried).toBe(1)
    await container.pool.query(`UPDATE mail_journal SET updated_at = now() - interval '10 minutes'`) // backoff elapses
    expect((await d.drivePending()).retried).toBe(1)
    await container.pool.query(`UPDATE mail_journal SET updated_at = now() - interval '10 minutes'`)
    expect((await d.drivePending()).sent).toBe(1)
    expect(new Set(port.handoffs.map((h) => h.idempotencyKey)).size).toBe(1)
    expect((await journalRows())[0]!.state).toBe('sent')
  })

  it('a definitive refusal fails LOUDLY: state=failed + an alarm, never a silent drop', async () => {
    await journalOne({ critical: true })
    const port = new ScriptedMailPort()
    port.script = ['permanent']
    const alarms: string[] = []
    const result = await driver(port, alarms).drivePending()
    expect(result.failed).toBe(1)
    expect((await journalRows())[0]!.state).toBe('failed')
    expect(alarms.some((a) => a.includes('FAILED permanently'))).toBe(true)
  })

  it('derived suppression: a permanent bounce silences NON-critical mail only — critical still sends', async () => {
    const port = new ScriptedMailPort()
    const d = driver(port)
    await d.recordBounce({ providerEventId: 'evt-1', providerRef: null, recipient: 'rosa@maker.example', kind: 'bounce', permanent: true, occurredAt: new Date().toISOString() })
    await journalOne({ critical: false, dedupRef: uuidv7() })
    await journalOne({ critical: true, dedupRef: uuidv7() })
    const result = await d.drivePending()
    expect(result.suppressed).toBe(1)
    expect(result.sent).toBe(1)
    const rows = await journalRows()
    expect(rows.find((r) => !r.critical)!.state).toBe('suppressed')
    expect(rows.find((r) => r.critical)!.state).toBe('sent')
  })

  it('a soft (transient) bounce never suppresses', async () => {
    const port = new ScriptedMailPort()
    const d = driver(port)
    await d.recordBounce({ providerEventId: 'evt-2', providerRef: null, recipient: 'rosa@maker.example', kind: 'bounce', permanent: false, occurredAt: new Date().toISOString() })
    await journalOne()
    expect((await d.drivePending()).sent).toBe(1)
  })

  it('a duplicate bounce webhook creates no duplicate state; a critical-letter bounce alarms', async () => {
    await journalOne({ critical: true })
    const port = new ScriptedMailPort()
    const alarms: string[] = []
    const d = driver(port, alarms)
    await d.drivePending() // sent → provider_ref msg-1
    const fact = { providerEventId: 'evt-3', providerRef: 'msg-1', recipient: 'rosa@maker.example', kind: 'bounce' as const, permanent: true, occurredAt: new Date().toISOString() }
    expect((await d.recordBounce(fact)).recorded).toBe(true)
    expect((await d.recordBounce(fact)).recorded).toBe(false) // replay answers with silence
    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM mail_bounces`)
    expect(rows[0].n).toBe(1)
    expect(alarms.some((a) => a.includes('CRITICAL letter'))).toBe(true)
  })

  it('a bounce arriving before local success processing still lands as a fact', async () => {
    const port = new ScriptedMailPort()
    const d = driver(port)
    const early = await d.recordBounce({ providerEventId: 'evt-4', providerRef: 'msg-never-seen', recipient: 'x@y.example', kind: 'complaint', permanent: true, occurredAt: new Date().toISOString() })
    expect(early.recorded).toBe(true)
  })

  it('the driver refuses to run inside a transaction (§7 tripwire)', async () => {
    const port = new ScriptedMailPort()
    const d = driver(port)
    await expect(inTx(() => d.drivePending())).rejects.toThrow(/G2/)
  })

  it('identity letters journal INSIDE the command tx: a rollback mails no one', async () => {
    const provider = new JournalingEmailProvider()
    await inTx(async (tx) => {
      await provider.deliver(tx as never, 'ghost@buyer.example', 'Confirm your DOF email', 'link')
      throw new Error('command failed — roll back')
    }).catch(() => {})
    expect(await journalRows()).toHaveLength(0) // the letter died with the transaction
    await inTx((tx) => provider.deliver(tx as never, 'real@buyer.example', 'Confirm your DOF email', 'link'))
    const rows = await journalRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ consumer: 'identity.letter', critical: true })
  })
})

describe('C12-1 — the bounce webhook: verified, replay-safe, fail closed, bounded', () => {
  const bouncedPayload = JSON.stringify({
    type: 'email.bounced',
    created_at: new Date().toISOString(),
    data: { email_id: 'msg-hook', to: ['rosa@maker.example'], bounce: { type: 'Permanent' } },
  })

  it('a correctly signed bounce lands exactly once (webhook replay converges)', async () => {
    const headers = svixHeaders(bouncedPayload)
    const first = await http.request('POST', '/api/webhooks/mail', { headers, body: bouncedPayload })
    expect(first.status).toBe(200)
    const replay = await http.request('POST', '/api/webhooks/mail', { headers, body: bouncedPayload })
    expect(replay.status).toBe(200)
    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM mail_bounces WHERE recipient = 'rosa@maker.example'`)
    expect(rows[0].n).toBe(1)
  })

  it('a forged signature is rejected and nothing is recorded', async () => {
    const headers = { ...svixHeaders(bouncedPayload), 'svix-signature': 'v1,Zm9yZ2VkforgedforgedforgedforgedforgedZQ==' }
    const res = await http.request('POST', '/api/webhooks/mail', { headers, body: bouncedPayload })
    expect(res.status).toBe(401)
    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM mail_bounces`)
    expect(rows[0].n).toBe(0)
  })

  it('a stale timestamp is rejected (replay window)', async () => {
    const id = `evt-${uuidv7()}`
    const staleTs = String(Math.floor(Date.now() / 1000) - 3600)
    const key = Buffer.from(WEBHOOK_SECRET.replace(/^whsec_/, ''), 'base64')
    const signature = createHmac('sha256', key).update(`${id}.${staleTs}.${bouncedPayload}`).digest('base64')
    const res = await http.request('POST', '/api/webhooks/mail', {
      headers: { 'svix-id': id, 'svix-timestamp': staleTs, 'svix-signature': `v1,${signature}`, 'content-type': 'application/json' },
      body: bouncedPayload,
    })
    expect(res.status).toBe(401)
  })

  it('malformed payloads are refused without effect', async () => {
    const bad = '{not json'
    const res = await http.request('POST', '/api/webhooks/mail', { headers: svixHeaders(bad), body: bad })
    expect(res.status).toBe(400)
  })

  it('a non-outcome event acknowledges and records nothing', async () => {
    const delivered = JSON.stringify({ type: 'email.delivered', data: { email_id: 'x', to: ['a@b.c'] } })
    const res = await http.request('POST', '/api/webhooks/mail', { headers: svixHeaders(delivered), body: delivered })
    expect(res.status).toBe(200)
    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM mail_bounces`)
    expect(rows[0].n).toBe(0)
  })
})
