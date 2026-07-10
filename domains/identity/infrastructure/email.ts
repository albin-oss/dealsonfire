/**
 * Email transport (WP-R1-B1, F-XC-1 first slice). Thin provider port + sandbox adapter;
 * the Notification *domain* is R4 — this is a platform service with calm rules as API
 * (transactional only, one message per event). Order emails reuse this in R1-B5.
 * The console adapter is the sandbox twin (test law); a real provider adapter binds by
 * config in production.
 */
import type { EmailPort } from '../domain/ports'

export interface EmailProvider {
  deliver(to: string, subject: string, body: string): Promise<void>
}

/** Sandbox provider: records sent mail in memory (tests assert on it; dev logs it). */
export class SandboxEmailProvider implements EmailProvider {
  readonly outbox: Array<{ to: string; subject: string; body: string }> = []
  async deliver(to: string, subject: string, body: string): Promise<void> {
    this.outbox.push({ to, subject, body })
  }
}

const TEMPLATES = {
  verify: (vars: Record<string, string>) => ({
    subject: 'Confirm your DOF email',
    body: `Welcome to DOF. Confirm your email to secure your account:\n\n${vars.link ?? vars.token}\n\nYou can keep using DOF in the meantime — this only protects password recovery.`,
  }),
  reset: (vars: Record<string, string>) => ({
    subject: 'Reset your DOF password',
    body: `Someone asked to reset your DOF password. If it was you, use this link within 30 minutes:\n\n${vars.link ?? vars.token}\n\nIf it wasn't you, you can ignore this — nothing changed.`,
  }),
} as const

export class TransactionalEmail implements EmailPort {
  constructor(private readonly provider: EmailProvider, private readonly baseUrl: string) {}
  async send(message: { to: string; template: 'verify' | 'reset'; vars: Record<string, string> }): Promise<void> {
    const path = message.template === 'reset' ? '/reset' : '/verify'
    const link = `${this.baseUrl}${path}?token=${encodeURIComponent(message.vars.token ?? '')}`
    const { subject, body } = TEMPLATES[message.template]({ ...message.vars, link })
    await this.provider.deliver(message.to, subject, body)
  }
}
