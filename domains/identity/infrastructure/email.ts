/**
 * Email transport (WP-R1-B1, F-XC-1 first slice). Thin provider port + sandbox adapter;
 * the Notification *domain* is R4 — this is a platform service with calm rules as API
 * (transactional only, one message per event). Order emails reuse this in R1-B5.
 * The console adapter is the sandbox twin (test law); a real provider adapter binds by
 * config in production.
 */
import type { Tx } from '../../../platform/types'
import { journalLetter } from '../../../platform/mail-journal'
import { uuidv7 } from '../../../platform/uuid'
import type { EmailPort } from '../domain/ports'

export interface EmailProvider {
  /** tx: C12-1 — the production provider journals inside the caller's
   *  transaction (§7); the sandbox ignores it. */
  deliver(tx: Tx, to: string, subject: string, body: string): Promise<void>
}

/** Sandbox provider: records sent mail in memory (tests assert on it; dev logs it). */
export class SandboxEmailProvider implements EmailProvider {
  readonly outbox: Array<{ to: string; subject: string; body: string }> = []
  async deliver(_tx: Tx, to: string, subject: string, body: string): Promise<void> {
    this.outbox.push({ to, subject, body })
  }
}

/**
 * C12-1 production provider: identity letters ride the platform mail journal —
 * composed and journaled in the command's transaction, sent by the driver
 * outside it. Every identity letter is CRITICAL (suppression-exempt, alarmed
 * on bounce): losing a verification or reset letter is losing the person.
 * dedupRef is the issuance itself (one journal row per issued token; a rolled
 * back command rolls the letter back with it).
 */
export class JournalingEmailProvider implements EmailProvider {
  async deliver(tx: Tx, to: string, subject: string, body: string): Promise<void> {
    await journalLetter(tx as never, {
      consumer: 'identity.letter', dedupRef: uuidv7(), to, subject, body, critical: true,
    })
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
  async send(tx: Tx, message: { to: string; template: 'verify' | 'reset'; vars: Record<string, string> }): Promise<void> {
    const path = message.template === 'reset' ? '/reset' : '/verify'
    const link = `${this.baseUrl}${path}?token=${encodeURIComponent(message.vars.token ?? '')}`
    const { subject, body } = TEMPLATES[message.template]({ ...message.vars, link })
    await this.provider.deliver(tx, message.to, subject, body)
  }
}
