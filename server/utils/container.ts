/**
 * Composition root (BLUEPRINT §1): wires infrastructure into the framework-free kernel.
 * One container per process; tests build their own against the test database.
 */
import type pg from 'pg'
import type { KernelDeps } from '@domains/merchant/core/application/deps'
import { OnboardingService } from '@domains/merchant/onboarding/application/onboarding-service'
import { PgOnboardingProfileRepository } from '@domains/merchant/onboarding/infrastructure/onboarding-repository'
import { EntitlementService } from '@domains/merchant/core/application/entitlement-service'
import { TrustPolicyService } from '@domains/merchant/core/application/trust-policy-service'
import { HandleService } from '@domains/merchant/core/application/handle-service'
import { standingConsequencePolicy } from '@domains/merchant/core/application/policies/standing-consequence-policy'
import { createBusinessCommand } from '@domains/merchant/core/application/commands/create-business'
import { createStoreCommand } from '@domains/merchant/core/application/commands/create-store'
import { updateBrandKitCommand } from '@domains/merchant/core/application/commands/update-brand-kit'
import { publishStoreCommand } from '@domains/merchant/core/application/commands/publish-store'
import { workspaceOverviewQuery } from '@domains/merchant/core/application/queries/workspace-overview'
import { handleAvailabilityQuery } from '@domains/merchant/core/application/queries/handle-availability'
import { createPool, PgUnitOfWork } from '@platform/db'
import { PgEventStore } from '@platform/event-store'
import { PgAuditLog } from '@platform/audit-log'
import { PgIdempotencyStore } from '@platform/idempotency-store'
import { OutboxDispatcher } from '@platform/outbox-dispatcher'
import { ProjectionRegistry } from '@platform/projection-registry'
import { ConsumerRegistry } from '@platform/consumer-registry'
import { HealthCheckRegistry, dbHealthCheck, projectionsHealthCheck } from '@platform/health'
import { SystemClock, type Clock } from '@platform/clock'
import { JsonConsoleLogger, type Logger } from '@platform/logger'
import { NoopMetrics, type Metrics } from '@platform/metrics'
import { EnvFeatureFlags, type FeatureFlags } from '@platform/config'
import { orderingScopeOf } from '@domains/merchant/core/domain/events'
import { PgMerchantAccountRepository } from '@domains/merchant/core/infrastructure/merchant-account-repository'
import { PgBusinessRepository } from '@domains/merchant/core/infrastructure/business-repository'
import { PgStoreRepository } from '@domains/merchant/core/infrastructure/store-repository'
import { PgStaffMembershipRepository } from '@domains/merchant/core/infrastructure/staff-membership-repository'
import { PgBrandKitRepository } from '@domains/merchant/core/infrastructure/brand-kit-repository'
import { PgStorefrontConfigRepository } from '@domains/merchant/core/infrastructure/storefront-config-repository'
import { PgHandleLedger } from '@domains/merchant/core/infrastructure/handle-ledger'
import { PgCapabilityRepository } from '@domains/merchant/core/infrastructure/capability-repository'
import { CatalogAbsentListingReadiness } from '@domains/merchant/core/infrastructure/listing-readiness'
import { kernelPayloadValidators } from '@contracts/schemas/events/payloads'
import { commercePayloadValidators } from '@contracts/schemas/events/commerce-payloads'
import { commerceOrderingScopeOf } from '@domains/commerce/catalog/domain/events'
import { PgProductRepository } from '@domains/commerce/catalog/infrastructure/product-repository'
import { PgPublicStorefrontDao } from '@domains/merchant/core/infrastructure/public-storefront-dao'
import { MediaService, VercelBlobStorage, SandboxMediaStorage } from '@platform/media'
import { optionalEnv } from '@platform/config'
import type { PublicStorefrontResponse } from '@contracts/schemas/merchant/public-storefront.schema'
import { asBusinessId } from '@domains/merchant/shared-kernel/ids'
import { PgAttributeSetRepository, PgBrandRefRepository } from '@domains/commerce/catalog/infrastructure/attribute-repository'
import { createAttributeSetCommand, archiveAttributeSetCommand, createBrandRefCommand } from '@domains/commerce/catalog/application/commands/attributes'
import { listAttributeSetsQuery, listBrandRefsQuery } from '@domains/commerce/catalog/application/queries/attributes'
import { PgProductReadDao } from '@domains/commerce/catalog/infrastructure/product-read-dao'
import type { CommerceDeps } from '@domains/commerce/catalog/application/ports'
import { createProductCommand } from '@domains/commerce/catalog/application/commands/create-product'
import { updateProductDetailsCommand } from '@domains/commerce/catalog/application/commands/update-product-details'
import { archiveProductCommand, restoreProductCommand } from '@domains/commerce/catalog/application/commands/lifecycle'
import { addVariantCommand, updateVariantCommand } from '@domains/commerce/catalog/application/commands/variants'
import { addMediaCommand, removeMediaCommand, reorderMediaCommand } from '@domains/commerce/catalog/application/commands/media'
import { addOptionCommand, addOptionValuesCommand, removeOptionCommand, removeOptionValueCommand } from '@domains/commerce/catalog/application/commands/options'
import { getProductQuery, listProductsQuery } from '@domains/commerce/catalog/application/queries/products'
import { PgLocationRepository } from '@domains/operations/locations/infrastructure/location-repository'
import type { OperationsDeps, StockAtLocationPort } from '@domains/operations/shared-kernel/ports'
import { operationsOrderingScopeOf } from '@domains/operations/locations/domain/events'
import { operationsPayloadValidators } from '@contracts/schemas/events/operations-payloads'
import { createLocationCommand } from '@domains/operations/locations/application/commands/create-location'
import { updateLocationCommand } from '@domains/operations/locations/application/commands/update-location'
import { closeLocationCommand } from '@domains/operations/locations/application/commands/close-location'
import { ensureGhostLocationCommand, ensureGhostLocationInTx } from '@domains/operations/locations/application/commands/ensure-ghost-location'
import { listLocationsQuery } from '@domains/operations/locations/application/queries/locations'
import { PgUserRepository } from '@domains/identity/infrastructure/user-repository'
import { PgSessionStore } from '@domains/identity/infrastructure/session-store'
import { PgRecoveryStore, PgGuestTokenStore, PgClaimStore, PgPasskeyStore } from '@domains/identity/infrastructure/token-stores'
import { PasskeyService } from '@domains/identity/application/passkey-service'
import { Argon2PasswordHasher, Sha256TokenHasher } from '@domains/identity/infrastructure/crypto'
import { TransactionalEmail, SandboxEmailProvider, type EmailProvider } from '@domains/identity/infrastructure/email'
import { WebAuthnService, MemoryChallengeStore } from '@domains/identity/infrastructure/webauthn'
import { identityOrderingScopeOf } from '@domains/identity/domain/events'
import type { IdentityDeps } from '@domains/identity/domain/ports'
import { identityPayloadValidators } from '@contracts/schemas/events/identity-payloads'
import { AuthService } from '@domains/identity/application/auth-service'
import { SessionService } from '@domains/identity/application/session-service'
import { GuestClaimService } from '@domains/identity/application/guest-claim-service'
import { merchantAccessAdapter } from './merchant-access'
import { MemoryRateLimiter, type RateLimiterPort } from './rate-limit'
import { getServerConfig } from './config'

export interface Container {
  pool: pg.Pool
  deps: KernelDeps
  entitlements: EntitlementService
  trustPolicy: TrustPolicyService
  handleService: HandleService
  idempotency: PgIdempotencyStore
  dispatcher: OutboxDispatcher
  rateLimiter: RateLimiterPort
  audit: PgAuditLog
  projections: ProjectionRegistry
  consumers: ConsumerRegistry
  health: HealthCheckRegistry
  clock: Clock
  logger: Logger
  metrics: Metrics
  flags: FeatureFlags
  commerce: {
    deps: CommerceDeps
    dispatcher: OutboxDispatcher
    audit: PgAuditLog
    commands: {
      createProduct: ReturnType<typeof createProductCommand>
      updateProductDetails: ReturnType<typeof updateProductDetailsCommand>
      archiveProduct: ReturnType<typeof archiveProductCommand>
      restoreProduct: ReturnType<typeof restoreProductCommand>
      addVariant: ReturnType<typeof addVariantCommand>
      updateVariant: ReturnType<typeof updateVariantCommand>
      addMedia: ReturnType<typeof addMediaCommand>
      removeMedia: ReturnType<typeof removeMediaCommand>
      reorderMedia: ReturnType<typeof reorderMediaCommand>
      addOption: ReturnType<typeof addOptionCommand>
      addOptionValues: ReturnType<typeof addOptionValuesCommand>
      removeOption: ReturnType<typeof removeOptionCommand>
      removeOptionValue: ReturnType<typeof removeOptionValueCommand>
      createAttributeSet: ReturnType<typeof createAttributeSetCommand>
      archiveAttributeSet: ReturnType<typeof archiveAttributeSetCommand>
      createBrandRef: ReturnType<typeof createBrandRefCommand>
    }
    queries: {
      getProduct: ReturnType<typeof getProductQuery>
      listProducts: ReturnType<typeof listProductsQuery>
      listAttributeSets: ReturnType<typeof listAttributeSetsQuery>
      listBrandRefs: ReturnType<typeof listBrandRefsQuery>
    }
  }
  identity: {
    dispatcher: OutboxDispatcher
    audit: PgAuditLog
    auth: AuthService
    sessions: SessionService
    guestClaim: GuestClaimService
    webauthn: WebAuthnService
    passkeyService: PasskeyService
    passkeys: PgPasskeyStore
    users: PgUserRepository
    emailOutbox: SandboxEmailProvider | null
  }
  operations: {
    deps: OperationsDeps
    dispatcher: OutboxDispatcher
    audit: PgAuditLog
    commands: {
      createLocation: ReturnType<typeof createLocationCommand>
      updateLocation: ReturnType<typeof updateLocationCommand>
      closeLocation: ReturnType<typeof closeLocationCommand>
      ensureGhostLocation: ReturnType<typeof ensureGhostLocationCommand>
    }
    queries: {
      listLocations: ReturnType<typeof listLocationsQuery>
    }
  }
  commands: {
    createBusiness: ReturnType<typeof createBusinessCommand>
    createStore: ReturnType<typeof createStoreCommand>
    updateBrandKit: ReturnType<typeof updateBrandKitCommand>
    publishStore: ReturnType<typeof publishStoreCommand>
  }
  queries: {
    workspaceOverview: ReturnType<typeof workspaceOverviewQuery>
    handleAvailability: ReturnType<typeof handleAvailabilityQuery>
    /** Public storefront read (UX-IGNITE Phase 3): live stores only; null = mask to 404. */
    publicStorefront: (handle: string) => Promise<PublicStorefrontResponse | null>
  }
  onboarding: OnboardingService
  /** Media Port (UX-AUTHOR-002 §D): storage adapter swappable; the registry is permanent. */
  media: MediaService
  shutdown(): Promise<void>
}

export function buildContainer(databaseUrl: string): Container {
  const pool = createPool(databaseUrl)
  // Merchant's platform-machinery instances (K1): one implementation, per-domain tables.
  const audit = new PgAuditLog(pool, { auditTable: 'audit_logs' })
  const deps: KernelDeps = {
    uow: new PgUnitOfWork(pool),
    merchantAccounts: new PgMerchantAccountRepository(),
    businesses: new PgBusinessRepository(),
    stores: new PgStoreRepository(),
    staff: new PgStaffMembershipRepository(),
    brandKits: new PgBrandKitRepository(),
    storefrontConfigs: new PgStorefrontConfigRepository(),
    handles: new PgHandleLedger(),
    capabilities: new PgCapabilityRepository(),
    eventStore: new PgEventStore({ eventsTable: 'domain_events', outboxTable: 'outbox_events', orderingScope: orderingScopeOf }),
    audit,
    listingReadiness: new CatalogAbsentListingReadiness(),
  }
  const entitlements = new EntitlementService(deps.capabilities)
  const handleService = new HandleService(deps.handles)
  const logger = new JsonConsoleLogger({ bound: { app: 'dof' } })
  const consumers = new ConsumerRegistry()
  consumers.register(standingConsequencePolicy(deps))
  const dispatcher = new OutboxDispatcher(
    pool,
    {
      outboxTable: 'outbox_events',
      eventsTable: 'domain_events',
      deliveriesTable: 'event_deliveries',
      housekeepingSql: [
        "SELECT audit_logs_ensure_partition((date_trunc('month', now()) + interval '1 month')::date)",
      ],
    },
    consumers.all(),
    kernelPayloadValidators(),
    { logError: (message) => logger.error(message, { component: 'outbox' }) },
  )
  const projections = new ProjectionRegistry() // populated by Commerce Batch 8 (ADR-004 C5)
  const health = new HealthCheckRegistry()
  health.register('database', dbHealthCheck(pool))
  health.register('projections', projectionsHealthCheck(projections, pool))

  // ——— Commerce domain wiring (D-22: same machinery, commerce-owned tables)
  const commerceAudit = new PgAuditLog(pool, { auditTable: 'commerce_audit_logs' })
  const commerceDeps: CommerceDeps = {
    uow: deps.uow,
    products: new PgProductRepository(),
    productReads: new PgProductReadDao(),
    attributeSets: new PgAttributeSetRepository(),
    brandRefs: new PgBrandRefRepository(),
    merchantAccess: merchantAccessAdapter(deps, entitlements),
    eventStore: new PgEventStore({
      eventsTable: 'commerce_domain_events',
      outboxTable: 'commerce_outbox_events',
      orderingScope: commerceOrderingScopeOf,
    }),
    audit: commerceAudit,
  }
  const commerceDispatcher = new OutboxDispatcher(
    pool,
    {
      outboxTable: 'commerce_outbox_events',
      eventsTable: 'commerce_domain_events',
      deliveriesTable: 'commerce_event_deliveries',
      housekeepingSql: [
        "SELECT commerce_audit_logs_ensure_partition((date_trunc('month', now()) + interval '1 month')::date)",
      ],
    },
    [
      // OPS-001: the Ghost Location policy — the first cross-domain consumer (CDC-001;
      // BLUEPRINT-003 §0.2). Idempotent twice over: the delivery ledger + the advisory-
      // locked ensure. Lazy ensure in operations commands is the correctness belt;
      // this consumer is the freshness suspenders.
      {
        consumer: 'operations.ghost-location',
        eventTypes: ['commerce.product.created'],
        async handle(tx, event) {
          const payload = event.payload as { business_id?: string; fulfillment_kind?: string }
          if (payload.fulfillment_kind !== 'physical' || !payload.business_id) return
          await ensureGhostLocationInTx(operationsDeps, tx, { businessId: payload.business_id })
        },
      },
    ],
    commercePayloadValidators(),
    { logError: (message) => logger.error(message, { component: 'commerce-outbox' }) },
  )

  // ————— Operations (OPS-001 Batch 1): own machinery instances (D-22), one adapter for
  // MerchantAccessPort (structural typing — CDC-001 §3), honest L2 stock port until the
  // ledger lands in Batch 2 (no stock_items table exists, so no location can hold stock).
  const operationsAudit = new PgAuditLog(pool, { auditTable: 'operations_audit_logs' })
  const noStockRecordedYet: StockAtLocationPort = {
    async hasStock() { return false }, // replaced by the stock_items query in OPS-001 Batch 2
  }
  const operationsDeps: OperationsDeps = {
    uow: deps.uow,
    locations: new PgLocationRepository(),
    stockAtLocation: noStockRecordedYet,
    merchantAccess: merchantAccessAdapter(deps, entitlements),
    eventStore: new PgEventStore({
      eventsTable: 'operations_domain_events',
      outboxTable: 'operations_outbox_events',
      orderingScope: operationsOrderingScopeOf,
    }),
    audit: operationsAudit,
  }
  const operationsDispatcher = new OutboxDispatcher(
    pool,
    {
      outboxTable: 'operations_outbox_events',
      eventsTable: 'operations_domain_events',
      deliveriesTable: 'operations_event_deliveries',
      housekeepingSql: [
        "SELECT operations_audit_logs_ensure_partition((date_trunc('month', now()) + interval '1 month')::date)",
      ],
    },
    [], // the Availability projection consumer arrives with Batch 2
    operationsPayloadValidators(),
    { logError: (message) => logger.error(message, { component: 'operations-outbox' }) },
  )

  // ————— Identity (WP-R1-B1): own machinery instances (D-22); the session adapter's backend.
  const { appBaseUrl, webauthnRpId, webauthnOrigin, isProduction: identityProd } = getServerConfig()
  const identityAudit = new PgAuditLog(pool, { auditTable: 'identity_audit_logs' })
  const identityEventStore = new PgEventStore({
    eventsTable: 'identity_domain_events',
    outboxTable: 'identity_outbox_events',
    orderingScope: identityOrderingScopeOf,
  })
  const passwordHasher = new Argon2PasswordHasher()
  const tokenHasher = new Sha256TokenHasher()
  const sandboxEmail = identityProd ? null : new SandboxEmailProvider()
  const emailProvider: EmailProvider = sandboxEmail ?? new SandboxEmailProvider() // real provider adapter binds by config in prod
  // SystemClock satisfies the identity domain's minimal Clock port structurally (P2).
  const identityClock = new SystemClock()
  const identityDeps: IdentityDeps = {
    uow: deps.uow,
    users: new PgUserRepository(),
    passwords: passwordHasher,
    tokens: tokenHasher,
    clock: identityClock,
    eventStore: identityEventStore,
    audit: identityAudit,
  }
  const identityRecovery = new PgRecoveryStore()
  const identitySessionStore = new PgSessionStore()
  const identityGuestStore = new PgGuestTokenStore()
  const identityClaimStore = new PgClaimStore()
  const identityPasskeys = new PgPasskeyStore()
  const identityAuth = new AuthService(identityDeps, identityRecovery, new TransactionalEmail(emailProvider, appBaseUrl))
  const identitySessions = new SessionService(deps.uow, identitySessionStore, tokenHasher, identityClock, identityEventStore)
  const identityGuestClaim = new GuestClaimService(deps.uow, tokenHasher, identityGuestStore, identityClaimStore, identityAudit)
  const identityWebauthn = new WebAuthnService(
    { rpName: 'DOF', rpId: webauthnRpId, origin: webauthnOrigin },
    new MemoryChallengeStore(),
  )
  const identityPasskeyService = new PasskeyService(deps.uow, identityWebauthn, identityPasskeys, identitySessions, identityAudit)
  const identityDispatcher = new OutboxDispatcher(
    pool,
    {
      outboxTable: 'identity_outbox_events',
      eventsTable: 'identity_domain_events',
      deliveriesTable: 'identity_event_deliveries',
      housekeepingSql: [
        "SELECT identity_audit_logs_ensure_partition((date_trunc('month', now()) + interval '1 month')::date)",
      ],
    },
    [],
    identityPayloadValidators(),
    { logError: (message) => logger.error(message, { component: 'identity-outbox' }) },
  )

  return {
    pool,
    deps,
    entitlements,
    trustPolicy: new TrustPolicyService(),
    handleService,
    idempotency: new PgIdempotencyStore(pool),
    dispatcher,
    projections,
    consumers,
    health,
    clock: new SystemClock(),
    logger,
    metrics: new NoopMetrics(),
    flags: new EnvFeatureFlags(),
    rateLimiter: new MemoryRateLimiter(),
    audit,
    commerce: {
      deps: commerceDeps,
      dispatcher: commerceDispatcher,
      audit: commerceAudit,
      commands: {
        createProduct: createProductCommand(commerceDeps),
        updateProductDetails: updateProductDetailsCommand(commerceDeps),
        archiveProduct: archiveProductCommand(commerceDeps),
        restoreProduct: restoreProductCommand(commerceDeps),
        addVariant: addVariantCommand(commerceDeps),
        updateVariant: updateVariantCommand(commerceDeps),
        addMedia: addMediaCommand(commerceDeps),
        removeMedia: removeMediaCommand(commerceDeps),
        reorderMedia: reorderMediaCommand(commerceDeps),
        addOption: addOptionCommand(commerceDeps),
        addOptionValues: addOptionValuesCommand(commerceDeps),
        removeOption: removeOptionCommand(commerceDeps),
        removeOptionValue: removeOptionValueCommand(commerceDeps),
        createAttributeSet: createAttributeSetCommand(commerceDeps),
        archiveAttributeSet: archiveAttributeSetCommand(commerceDeps),
        createBrandRef: createBrandRefCommand(commerceDeps),
      },
      queries: {
        getProduct: getProductQuery(commerceDeps),
        listProducts: listProductsQuery(commerceDeps),
        listAttributeSets: listAttributeSetsQuery(commerceDeps),
        listBrandRefs: listBrandRefsQuery(commerceDeps),
      },
    },
    identity: {
      dispatcher: identityDispatcher,
      audit: identityAudit,
      auth: identityAuth,
      sessions: identitySessions,
      guestClaim: identityGuestClaim,
      webauthn: identityWebauthn,
      passkeyService: identityPasskeyService,
      passkeys: identityPasskeys,
      users: identityDeps.users as PgUserRepository,
      emailOutbox: sandboxEmail,
    },
    operations: {
      deps: operationsDeps,
      dispatcher: operationsDispatcher,
      audit: operationsAudit,
      commands: {
        createLocation: createLocationCommand(operationsDeps),
        updateLocation: updateLocationCommand(operationsDeps),
        closeLocation: closeLocationCommand(operationsDeps),
        ensureGhostLocation: ensureGhostLocationCommand(operationsDeps),
      },
      queries: {
        listLocations: listLocationsQuery(operationsDeps),
      },
    },
    commands: {
      createBusiness: createBusinessCommand(deps, entitlements),
      createStore: createStoreCommand(deps, entitlements, handleService),
      updateBrandKit: updateBrandKitCommand(deps, entitlements),
      publishStore: publishStoreCommand(deps, entitlements),
    },
    queries: {
      workspaceOverview: workspaceOverviewQuery(deps, entitlements),
      handleAvailability: handleAvailabilityQuery(deps),
      // Composition-root read: joins the merchant's public face with the commerce shelf.
      // One transaction, read-only; a null anywhere masks to 404 at the endpoint.
      publicStorefront: async (handle: string) => {
        const publicDao = new PgPublicStorefrontDao()
        return deps.uow.withTransaction(async (tx) => {
          const front = await publicDao.findLiveByHandle(tx, handle)
          if (!front) return null
          const products = await commerceDeps.productReads.listPublicShelf(tx, asBusinessId(front.businessId))
          return {
            store: { handle: front.handle, name: front.name, published_at: front.publishedAt },
            brand: front.brand,
            products: products.map((p) => ({
              id: p.id, title: p.title, price_minor: p.min_price_amount, currency: p.price_currency,
            })),
          }
        })
      },
    },
    onboarding: new OnboardingService(deps.uow, new PgOnboardingProfileRepository(), audit),
    // Media Port: Blob in production (token present); the sandbox twin otherwise (tests,
    // local dev) — same contract, so consumers never know the difference (test law).
    media: new MediaService(
      pool,
      (() => {
        const token = optionalEnv('BLOB_READ_WRITE_TOKEN')
        return token ? new VercelBlobStorage(token) : new SandboxMediaStorage()
      })(),
    ),
    shutdown: () => pool.end(),
  }
}

let instance: Container | null = null

export function getContainer(): Container {
  if (!instance) {
    const { databaseUrl } = getServerConfig()
    if (!databaseUrl) throw new Error('NUXT_DATABASE_URL is not configured')
    instance = buildContainer(databaseUrl)
  }
  return instance
}

/** Test hook: inject a container built against the test database. */
export function setContainer(container: Container | null): void {
  instance = container
}
