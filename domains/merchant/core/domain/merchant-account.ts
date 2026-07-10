/**
 * MerchantAccount aggregate (ADR-001 §5.1) — the commercial actor. Deliberately thin:
 * a person, even a merchant, is mostly Identity's concern.
 */
import { type Result, ok, err } from '../../../../shared/result'
import { type DomainError, domainError } from '../../../../shared/errors'
import { type MerchantId, type UserId, newMerchantId } from '../../shared-kernel/ids'

export type MerchantAccountStatus = 'active' | 'deactivated'

export interface MerchantAccountProps {
  id: MerchantId
  userId: UserId
  displayName: string
  preferences: Record<string, unknown>
  status: MerchantAccountStatus
}

export class MerchantAccount {
  private constructor(private readonly props: MerchantAccountProps) {}

  static create(userId: UserId, displayName: string): Result<MerchantAccount, DomainError> {
    const name = displayName.trim()
    if (!name || name.length > 80) {
      return err(domainError('VALIDATION_FAILED', 'display name must be 1–80 characters'))
    }
    return ok(new MerchantAccount({ id: newMerchantId(), userId, displayName: name, preferences: {}, status: 'active' }))
  }

  static rehydrate(props: MerchantAccountProps): MerchantAccount {
    return new MerchantAccount(props)
  }

  get id() { return this.props.id }
  get userId() { return this.props.userId }
  get displayName() { return this.props.displayName }
  get preferences() { return this.props.preferences }
  get status() { return this.props.status }

  /** MerchantEligibilitySpec (kernel portion — DECISIONS D-07). */
  get isEligibleToOperate(): boolean {
    return this.props.status === 'active'
  }
}
