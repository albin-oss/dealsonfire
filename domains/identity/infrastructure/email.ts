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
  // C12-3 — the email-change letters (account-takeover surface: every word is
  // load-bearing; the truth goes to the ADDRESS, never to whoever asked)
  email_change_confirm: (vars: Record<string, string>) => ({
    subject: 'Confirm your new DOF email',
    body: `Someone with access to a DOF account asked to move it to this address. If that was you, confirm within 30 minutes:\n\n${vars.link ?? vars.token}\n\nIf it wasn't you, ignore this — nothing will change.`,
  }),
  email_change_notice: (vars: Record<string, string>) => ({
    subject: 'Your DOF email is being changed',
    body: `Someone signed in to your account and asked to move it to ${vars.new_hint ?? 'a new address'}.\n\nIf this was you: nothing to do — confirm from the new inbox.\n\nIf it was NOT you: change your password now, and when the change completes you will receive a letter here that can take the account back for 72 hours.`,
  }),
  email_change_already_yours: (_vars: Record<string, string>) => ({
    subject: 'This address is already on a DOF account',
    body: `Someone tried to attach this email to a different DOF account. Nothing happened — this address stays exactly where it is.\n\nIf this was you, sign in to the account this address already belongs to.`,
  }),
  email_change_revert: (vars: Record<string, string>) => ({
    subject: 'Your DOF account moved — you can take it back for 72 hours',
    body: `Your account's email just changed to ${vars.new_hint ?? 'a new address'}.\n\nIf this was you: nothing to do.\n\nIf it was NOT you: press this within 72 hours and the account comes home — every other session and key is thrown out with it:\n\n${vars.link ?? vars.token}`,
  }),
  email_change_reverted: (_vars: Record<string, string>) => ({
    subject: 'Your DOF account is back home',
    body: `Your account answers to this address again. Every session and outstanding key was thrown out — sign in fresh with your password, and consider changing it if anything felt off.`,
  }),
} as const

export class TransactionalEmail implements EmailPort {
  constructor(private readonly provider: EmailProvider, private readonly baseUrl: string) {}
  async send(tx: Tx, message: { to: string; template: keyof typeof TEMPLATES; vars: Record<string, string> }): Promise<void> {
    const path = message.template === 'reset' ? '/reset'
      : message.template === 'email_change_confirm' ? '/confirm-email-change'
      : message.template === 'email_change_revert' ? '/undo-email-change'
      : '/verify'
    const link = `${this.baseUrl}${path}?token=${encodeURIComponent(message.vars.token ?? '')}`
    const { subject, body } = TEMPLATES[message.template]({ ...message.vars, link })
    await this.provider.deliver(tx, message.to, subject, body)
  }
}
