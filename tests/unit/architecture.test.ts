/**
 * Architecture + type tests (IMP-PLT-001). The boundary and data-constitution gates run
 * as tests too, so a local `npm test` catches what CI would; type tests pin the contracts
 * the compiler is supposed to guarantee (they fail at typecheck time, not runtime).
 */
import { describe, it, expect, expectTypeOf } from 'vitest'
import { execFileSync } from 'node:child_process'
import type { BusinessId, StoreId } from '@domains/merchant/shared-kernel/ids'
import { asBusinessId } from '@domains/merchant/shared-kernel/ids'
import type { Actor } from '@domains/merchant/shared-kernel/actor'
import type { PlatformActor, NewDomainEvent } from '@platform/events'
import type { EventStore as MerchantEventStore } from '@domains/merchant/core/domain/ports'
import type { EventStore as PlatformEventStore } from '@platform/types'
import { uuidv7 } from '@platform/uuid'

describe('architecture gates as tests', () => {
  it('boundary lint passes', () => {
    const out = execFileSync('node', ['scripts/check-boundaries.mjs'], { encoding: 'utf8' })
    expect(out).toContain('boundaries clean')
  })

  it('data-constitution lint passes', () => {
    const out = execFileSync('node', ['scripts/check-data-constitution.mjs'], { encoding: 'utf8' })
    expect(out).toContain('data constitution clean')
  })
})

describe('type contracts', () => {
  it('branded ids are not cross-assignable (compile-time gate 0)', () => {
    expectTypeOf(asBusinessId(uuidv7())).toMatchTypeOf<BusinessId>()
    expectTypeOf<BusinessId>().not.toMatchTypeOf<StoreId>()
    expectTypeOf<StoreId>().not.toMatchTypeOf<BusinessId>()
  })

  it('merchant Actor is assignable to the platform envelope actor (D-22 narrowing)', () => {
    expectTypeOf<Actor>().toMatchTypeOf<PlatformActor>()
  })

  it('merchant EventStore port IS the platform port (re-export, not a fork)', () => {
    expectTypeOf<MerchantEventStore>().toEqualTypeOf<PlatformEventStore>()
  })

  it('platform envelope accepts merchant-made events', () => {
    const event: NewDomainEvent = {
      eventType: 'merchant.store.created',
      schemaVersion: 1,
      businessId: uuidv7(),
      aggregate: { type: 'store', id: uuidv7() },
      actor: { type: 'user', id: uuidv7() },
      payload: {},
    }
    expect(event.eventType).toBeTruthy()
  })
})
