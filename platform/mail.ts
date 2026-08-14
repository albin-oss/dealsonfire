/**
 * MailPort (Commerce Foundation C7; production adapter C12-1) — the ONE
 * outbound-mail boundary. Sandbox transport everywhere no provider is
 * configured (records + logs, never sends); the Resend adapter binds by
 * config at the same port.
 *
 * HONEST SEMANTICS (C12-1, binding): DOF guarantees exactly-once letter
 * COMPOSITION (the mail journal) and IDEMPOTENT provider handoff (the
 * idempotency key rides every send). Delivery to the recipient's server is
 * external reality — outcomes arrive as bounce/complaint facts and are never
 * assumed. "Provider accepted" is never presented as "recipient received".
 */

export interface MailMessage {
  to: string
  subject: string
  body: string
  /** Stable per logical letter (C12-1: derived from consumer + dedup ref +
   *  recipient). The provider collapses handoff retries to one send. */
  idempotencyKey?: string
}

export interface MailPort {
  readonly name: 'sandbox' | 'provider'
  /** Resolves with the provider's message reference (null when the transport
   *  has none — sandbox). Throws RetryableMailError / PermanentMailError. */
  send(message: MailMessage): Promise<{ providerRef: string | null }>
}

/** The provider said "not now" (5xx, 429, network) — the driver retries under
 *  the SAME idempotency key. */
export class RetryableMailError extends Error {}
/** The provider refused this letter definitively (invalid recipient, bad
 *  payload) — retrying cannot help; the journal marks it failed, loudly. */
export class PermanentMailError extends Error {}

/** Dev/test transport: the outbox is inspectable; nothing leaves the machine. */
export class SandboxMailer implements MailPort {
  readonly name = 'sandbox' as const
  readonly outbox: MailMessage[] = []
  constructor(private readonly log?: (line: string) => void) {}
  async send(message: MailMessage): Promise<{ providerRef: string | null }> {
    this.outbox.push(message)
    this.log?.(`[mail:sandbox] to=${message.to} subject="${message.subject}"`)
    return { providerRef: null }
  }
}

/**
 * Resend adapter (MAIL_PROVIDER_DECISION.md). Plain HTTP, no SDK: one POST,
 * the Idempotency-Key header, and honest error classes. The API key never
 * appears in logs or errors.
 */
export class ResendMailAdapter implements MailPort {
  readonly name = 'provider' as const
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: MailMessage): Promise<{ providerRef: string | null }> {
    let response: Response
    try {
      response = await this.fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...(message.idempotencyKey ? { 'Idempotency-Key': message.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.body,
        }),
      })
    } catch (error) {
      // network failure: the result is UNKNOWN — retry under the same key;
      // the provider's idempotency window collapses a landed-but-unanswered
      // send back to one email
      throw new RetryableMailError(`mail provider unreachable: ${(error as Error).message}`)
    }
    if (response.ok) {
      const body = await response.json().catch(() => ({})) as { id?: string }
      return { providerRef: body.id ?? null }
    }
    const detail = await response.text().catch(() => '')
    if (response.status === 429 || response.status >= 500) {
      throw new RetryableMailError(`mail provider ${response.status}: ${detail.slice(0, 200)}`)
    }
    throw new PermanentMailError(`mail provider refused (${response.status}): ${detail.slice(0, 200)}`)
  }
}
