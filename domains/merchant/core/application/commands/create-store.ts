/**
 * CreateStore (BLUEPRINT §4). A store is born Draft with default policies, a default
 * BrandKit derived from its name (Beautiful by Default: the default is designer-grade,
 * not a placeholder), and a default StorefrontConfig — publishable without touching Settings.
 * The second store requires the stores.multiple capability (TierLimitPolicy, ADR §5.4).
 */
import { type Result, ok, err } from '../../../../../shared/result'
import type { DomainError } from '../../../../../shared/errors'
import { domainError } from '../../../../../shared/errors'
import type { KernelDeps } from '../deps'
import { traceFromRequest } from '../trace'
import type { EntitlementService } from '../entitlement-service'
import type { HandleService } from '../handle-service'
import { resolveAndAuthorize } from '../access'
import { createStore as storeFactory } from '../../domain/factories/store-factory'
import { createBrandKit } from '../../../shared-kernel/brand-kit'
import { newStoreId } from '../../../shared-kernel/ids'
import type { Actor } from '../../../shared-kernel/actor'

/** Beautiful by Default: the "Ember" theme, tuned per-store by AI in Module 3. */
const DEFAULT_THEME_KEY = 'ember'
const DEFAULT_PALETTE = { primary: '#FF4500', surface: '#FFF8F4', ink: '#1F1A17' }

export interface CreateStoreInput {
  actor: Actor
  userId: string
  businessId: string
  name: string
  handle?: string
  stepUpVerified?: boolean
  requestContext?: Record<string, unknown>
}

export interface CreateStoreOutput {
  storeId: string
  businessId: string
  handle: string
  name: string
  status: string
  enforcementHold: string
}

export function createStoreCommand(deps: KernelDeps, entitlements: EntitlementService, handleService: HandleService) {
  return async (input: CreateStoreInput): Promise<Result<CreateStoreOutput, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const access = await resolveAndAuthorize(deps, entitlements, tx, {
        actor: input.actor,
        userId: input.userId,
        businessId: input.businessId,
        stepUpVerified: input.stepUpVerified,
        lockBusiness: true, // serializes concurrent store creation per business (store-count gate below)
        spec: { command: 'merchant.store.create', permission: 'store.create', capability: 'store.core' },
      })
      if (!access.ok) return access
      const { business, capabilities } = access.value

      const existing = await deps.stores.countActiveByBusiness(tx, business.id)
      if (existing >= 1 && !capabilities.has('stores.multiple')) {
        return err(domainError('CAPABILITY_MISSING', 'a second store requires the stores.multiple capability', {
          capability: 'stores.multiple',
        }))
      }

      // Claim the handle BEFORE building the aggregate, so the store is constructed exactly once.
      // Explicit handle = no silent fallback (the merchant chose it); derived handle = numbered
      // fallback (Ignite psychology: never error on our own suggestion).
      const storeId = newStoreId()
      const claimed = await handleService.claimWithFallback(
        tx,
        input.handle ?? handleService.deriveFromName(input.name),
        storeId,
        input.handle === undefined,
      )
      if (!claimed.ok) return claimed

      const made = storeFactory({
        id: storeId,
        businessId: business.id,
        name: input.name,
        handle: claimed.value,
        actor: input.actor,
      })
      if (!made.ok) return made
      const { store, events } = made.value

      await deps.stores.insert(tx, store)
      await deps.storefrontConfigs.insertDefault(tx, { storeId: store.id, businessId: business.id, themeKey: DEFAULT_THEME_KEY })

      const kit = createBrandKit({ name: store.name, palette: DEFAULT_PALETTE })
      if (!kit.ok) return kit
      await deps.brandKits.upsert(tx, {
        brandKit: kit.value,
        ownerType: 'store',
        ownerId: store.id,
        businessId: business.id,
      })

      await deps.eventStore.append(tx, events, traceFromRequest(input.requestContext))

      await deps.audit.record(tx, {
        businessId: business.id,
        actor: input.actor,
        command: 'merchant.store.create',
        sensitivity: 'normal',
        target: { type: 'store', id: store.id },
        afterDigest: { name: store.name, handle: store.handle },
        context: input.requestContext,
      })

      return ok({
        storeId: store.id,
        businessId: business.id,
        handle: store.handle as string,
        name: store.name,
        status: store.status,
        enforcementHold: store.enforcementHold,
      })
    })
  }
}
