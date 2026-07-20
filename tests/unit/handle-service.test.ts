import { describe, it, expect } from 'vitest'
import { HandleService } from '@domains/merchant/core/application/handle-service'
import { createHandle } from '@domains/merchant/shared-kernel/handle'
import { asStoreId } from '@domains/merchant/shared-kernel/ids'
import { uuidv7 } from '@domains/merchant/shared-kernel/uuid'
import type { HandleLedger, Tx } from '@domains/merchant/core/domain/ports'

const alwaysFree: HandleLedger = { claim: async () => true, lookup: async () => ({ taken: false }) }

describe('deriveFromName — REVIEW-001 H-3 regression: the Grandma Test does not speak ASCII', () => {
  const service = new HandleService(alwaysFree)

  it.each(['Rosa Knits', "Rosa's Knits!", 'Café Olé'])('derives a usable slug from "%s"', (name) => {
    const derived = service.deriveFromName(name)
    expect(createHandle(derived).ok).toBe(true)
  })

  it.each(['毛糸の店', '☕☕', '!!!', 'متجر الحرف', 'Store', 'Spark', 'ab'])(
    'ALWAYS returns a valid, unreserved handle for "%s"',
    (name) => {
      const derived = service.deriveFromName(name)
      const validated = createHandle(derived)
      expect(validated.ok, `derived "${derived}" must validate`).toBe(true)
    },
  )
})

describe('claimWithFallback — derived handles never surface HANDLE_TAKEN (D-16)', () => {
  it('walks numbered then random fallbacks when everything collides', async () => {
    let calls = 0
    const mostlyTaken: HandleLedger = {
      claim: async (_tx: Tx, _handle: string) => {
        calls++
        return calls > 10 // preferred + 8 numbered + first random fail; second random succeeds
      },
      lookup: async () => ({ taken: false }),
    }
    const service = new HandleService(mostlyTaken)
    const result = await service.claimWithFallback({}, 'rosa-knits', asStoreId(uuidv7()), true)
    expect(result.ok).toBe(true)
  })

  it('explicit (merchant-chosen) handles fail loudly with suggestions', async () => {
    const allTaken: HandleLedger = { claim: async () => false, lookup: async () => ({ taken: true }) }
    const service = new HandleService(allTaken)
    const result = await service.claimWithFallback({}, 'rosa-knits', asStoreId(uuidv7()), false)
    expect(!result.ok && result.error.code).toBe('HANDLE_TAKEN')
    if (!result.ok) expect((result.error.details as { suggestions: string[] }).suggestions.length).toBeGreaterThan(0)
  })

  it('a reserved derived candidate falls back instead of erroring (defense in depth)', async () => {
    const service = new HandleService(alwaysFree)
    const result = await service.claimWithFallback({}, 'store', asStoreId(uuidv7()), true)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value as string).toMatch(/^store-[a-z2-9]{6}$/)
  })
})
