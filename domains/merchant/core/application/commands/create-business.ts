/**
 * CreateBusiness (BLUEPRINT §4) — the One Identity moment: creating your first business
 * makes you a merchant, atomically (account + business + Owner membership + events + audit
 * in ONE transaction). No separate account, ever (Constitution: One Identity).
 */
import { type Result, ok, err } from '../../../../../shared/result'
import type { DomainError } from '../../../../../shared/errors'
import { domainError } from '../../../../../shared/errors'
import type { KernelDeps } from '../deps'
import { traceFromRequest } from '../trace'
import type { EntitlementService } from '../entitlement-service'
import { MerchantAccount } from '../../domain/merchant-account'
import { StaffMembership } from '../../domain/staff-membership'
import { createBusiness as businessFactory } from '../../domain/factories/business-factory'
import { EVENT, makeEvent } from '../../domain/events'
import { asUserId } from '../../../shared-kernel/ids'
import type { Actor } from '../../../shared-kernel/actor'
import type { BusinessType } from '../../domain/business'

export interface CreateBusinessInput {
  actor: Actor
  userId: string
  displayName: string
  businessType: BusinessType
  requestContext?: Record<string, unknown>
}

export interface CreateBusinessOutput {
  businessId: string
  membershipId: string
  merchantId: string
  displayName: string
  businessType: BusinessType
  trustLevel: string
  scaleTier: string
  standing: string
}

export function createBusinessCommand(deps: KernelDeps, entitlements: EntitlementService) {
  return async (input: CreateBusinessInput): Promise<Result<CreateBusinessOutput, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const userId = asUserId(input.userId)

      // Merchant account: find or create (Registered User → Merchant, ADR §6).
      // Display name defaults to the first business's name until Identity provides a
      // person-level profile (REVIEW-001 L-4 — the persona is editable later).
      let account = await deps.merchantAccounts.findByUserId(tx, userId)
      let onboarded = false
      if (!account) {
        const created = MerchantAccount.create(userId, input.displayName)
        if (!created.ok) return created
        if (await deps.merchantAccounts.insertIfAbsent(tx, created.value)) {
          account = created.value
          onboarded = true
        } else {
          // Concurrent first-business race (M-4): the other request won; use its account.
          account = await deps.merchantAccounts.findByUserId(tx, userId)
          if (!account) return err(domainError('CONFLICT', 'merchant account creation raced; retry'))
        }
      }
      if (!account.isEligibleToOperate) {
        return err(domainError('MERCHANT_INELIGIBLE', 'this account cannot operate a business'))
      }

      const made = businessFactory({ displayName: input.displayName, businessType: input.businessType, actor: input.actor })
      if (!made.ok) return made
      const { business, events } = made.value
      await deps.businesses.insert(tx, business)

      // Registry sanity: a newborn business must be entitled to store.core (seeded default).
      const caps = await entitlements.resolveEffective(tx, business)
      if (!caps.has('store.core')) {
        return err(domainError('INTERNAL', 'capability registry is not seeded (store.core missing)'))
      }

      const owner = StaffMembership.createOwner(business.id, input.userId, input.actor)
      await deps.staff.insert(tx, owner)

      const allEvents = [
        ...(onboarded
          ? [makeEvent(EVENT.MERCHANT_ONBOARDED, { type: 'merchant_account' as const, id: account.id }, null, input.actor, {
              merchant_id: account.id, user_id: input.userId, source: 'direct' as const,
            })]
          : []),
        ...events,
        ...owner.pullPendingEvents(),
      ]
      await deps.eventStore.append(tx, allEvents, traceFromRequest(input.requestContext))

      await deps.audit.record(tx, {
        businessId: business.id,
        actor: input.actor,
        command: 'merchant.business.create',
        sensitivity: 'normal',
        target: { type: 'business', id: business.id },
        afterDigest: { display_name: business.displayName, business_type: business.businessType },
        context: input.requestContext,
      })

      return ok({
        businessId: business.id,
        membershipId: owner.id,
        merchantId: account.id,
        displayName: business.displayName,
        businessType: business.businessType,
        trustLevel: business.trustLevel,
        scaleTier: business.scaleTier,
        standing: business.standing,
      })
    })
  }
}
