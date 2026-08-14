/**
 * C12-1 — the Resend adapter's contract, pinned without the network:
 * the idempotency key rides every send; outcomes map to the honest error
 * classes (retryable = the driver may retry under the SAME key; permanent =
 * fail loudly); an UNKNOWN network result is retryable — the adapter never
 * invents success or failure, the provider's idempotency window disambiguates.
 */
import { describe, it, expect } from 'vitest'
import { ResendMailAdapter, RetryableMailError, PermanentMailError } from '@platform/mail'

const LETTER = { to: 'rosa@maker.example', subject: 'Hi', body: 'Words.', idempotencyKey: 'mail:test:1:abcd' }

function fakeFetch(status: number, body: unknown = { id: 'msg-1' }) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! })
    return new Response(JSON.stringify(body), { status })
  }) as typeof fetch
  return { impl, calls }
}

describe('ResendMailAdapter', () => {
  it('carries the idempotency key, the from identity, and plaintext only — and returns the provider ref', async () => {
    const { impl, calls } = fakeFetch(200)
    const adapter = new ResendMailAdapter('re_test_key', 'DOF <letters@dof.example>', impl)
    const result = await adapter.send(LETTER)
    expect(result.providerRef).toBe('msg-1')
    const headers = calls[0]!.init.headers as Record<string, string>
    expect(headers['Idempotency-Key']).toBe('mail:test:1:abcd')
    expect(headers['Authorization']).toBe('Bearer re_test_key')
    const payload = JSON.parse(String(calls[0]!.init.body))
    expect(payload).toMatchObject({ from: 'DOF <letters@dof.example>', to: ['rosa@maker.example'], subject: 'Hi', text: 'Words.' })
    expect(payload.html).toBeUndefined() // plaintext letters — no tracking surface
  })

  it('429 and 5xx are RETRYABLE (same key next time); 4xx is PERMANENT (loud failure)', async () => {
    for (const status of [429, 500, 503]) {
      const adapter = new ResendMailAdapter('k', 'f', fakeFetch(status, {}).impl)
      await expect(adapter.send(LETTER)).rejects.toBeInstanceOf(RetryableMailError)
    }
    for (const status of [400, 403, 422]) {
      const adapter = new ResendMailAdapter('k', 'f', fakeFetch(status, {}).impl)
      await expect(adapter.send(LETTER)).rejects.toBeInstanceOf(PermanentMailError)
    }
  })

  it('an UNKNOWN network result is retryable — never invented success, never invented failure', async () => {
    const adapter = new ResendMailAdapter('k', 'f', (async () => { throw new Error('socket hang up') }) as typeof fetch)
    await expect(adapter.send(LETTER)).rejects.toBeInstanceOf(RetryableMailError)
  })

  it('error details never contain the API key', async () => {
    const adapter = new ResendMailAdapter('re_SECRET_VALUE', 'f', fakeFetch(500, { message: 'boom' }).impl)
    const error = await adapter.send(LETTER).catch((e: Error) => e)
    expect((error as Error).message).not.toContain('re_SECRET_VALUE')
  })
})
