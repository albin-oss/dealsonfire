/**
 * MailPort (Commerce Foundation C7) — the ONE outbound-mail boundary for the
 * notification seam. Sandbox transport everywhere no provider is configured
 * (records + logs, never sends); the production adapter binds by config at
 * the same port. Platform-owned: notifications are a seam, not a domain.
 */
export interface MailMessage {
  to: string
  subject: string
  body: string
}

export interface MailPort {
  readonly name: 'sandbox' | 'provider'
  send(message: MailMessage): Promise<void>
}

/** Dev/test transport: the outbox is inspectable; nothing leaves the machine. */
export class SandboxMailer implements MailPort {
  readonly name = 'sandbox' as const
  readonly outbox: MailMessage[] = []
  constructor(private readonly log?: (line: string) => void) {}
  async send(message: MailMessage): Promise<void> {
    this.outbox.push(message)
    this.log?.(`[mail:sandbox] to=${message.to} subject="${message.subject}"`)
  }
}
