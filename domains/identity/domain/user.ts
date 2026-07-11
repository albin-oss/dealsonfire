/**
 * User aggregate (WP-R1-B1). The identity of one person (One Identity — ADR-001);
 * evolves into merchant-hood without a second account. Credentials/passkeys/sessions
 * are child concerns persisted alongside; the aggregate owns identity facts + events.
 */
import { type Result, ok, err } from '../../../shared/result'
import { domainError, type DomainError } from '../../../shared/errors'
import type { Actor } from '../../merchant/shared-kernel/actor'
import type { UserId } from '../shared-kernel/ids'
import {
  IDENTITY_EVENT, makeIdentityEvent,
  type NewDomainEvent, type UserRegisteredPayload,
} from './events'
import { createDisplayName } from './value-objects'

export interface UserProps {
  id: UserId
  email: string
  emailVerified: boolean
  displayName: string | null
  status: 'active' | 'deactivated'
  sequence: number
}

export class User {
  private pending: NewDomainEvent[] = []
  private constructor(private readonly props: UserProps) {}

  /**
   * Rehydrate a persisted user. Corruption-guard (kernel law): a row the domain cannot
   * explain is an outage, not a guess — refuse structurally-impossible state explicitly.
   */
  static rehydrate(props: UserProps): User {
    const bad = (why: string): never => { throw new Error(`corrupt user row (${props.id}): ${why}`) }
    if (!props.id) bad('missing id')
    if (!props.email) bad('missing email')
    if (props.status !== 'active' && props.status !== 'deactivated') bad(`unknown status "${props.status}"`)
    if (!Number.isInteger(props.sequence) || props.sequence < 0) bad(`invalid sequence ${props.sequence}`)
    if (props.displayName !== null && (typeof props.displayName !== 'string' || props.displayName.length > 80)) bad('invalid displayName')
    return new User(props)
  }

  static register(
    input: { id: UserId; email: string; displayName: string | null; source: 'direct' | 'ignite_claim' },
    actor: Actor,
  ): User {
    const user = new User({
      id: input.id,
      email: input.email,
      emailVerified: false,
      displayName: input.displayName,
      status: 'active',
      sequence: 0,
    })
    user.pending.push(makeIdentityEvent<UserRegisteredPayload>(
      IDENTITY_EVENT.USER_REGISTERED, input.id, actor,
      { user_id: input.id, source: input.source },
    ))
    return user
  }

  get id() { return this.props.id }
  get email() { return this.props.email }
  get emailVerified() { return this.props.emailVerified }
  get displayName() { return this.props.displayName }
  get status() { return this.props.status }
  get sequence() { return this.props.sequence }

  verifyEmail(): void {
    if (this.props.emailVerified) return // idempotent, eventless
    this.props.emailVerified = true
    this.props.sequence += 1
  }

  rename(raw: string | null, _actor: Actor): Result<void, DomainError> {
    const name = createDisplayName(raw)
    if (!name.ok) return name
    if (name.value === this.props.displayName) return ok(undefined) // no-op (D-29)
    this.props.displayName = name.value
    this.props.sequence += 1
    return ok(undefined)
  }

  ensureActive(): Result<void, DomainError> {
    if (this.props.status !== 'active') {
      return err(domainError('AUTH_REQUIRED', 'this account is not active'))
    }
    return ok(undefined)
  }

  pullPendingEvents(): NewDomainEvent[] {
    const events = this.pending
    this.pending = []
    return events
  }
}
