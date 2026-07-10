/** Location aggregate — L1–L4, detected-change events, payload-schema sweep (OPS-001A). */
import { describe, it, expect } from 'vitest'
import { Location } from '@domains/operations/locations/domain/location'
import { asLocationId } from '@domains/operations/shared-kernel/ids'
import { addressEquals, createAddress, createLocationName, createOperatingWindow, operatingWindowEquals } from '@domains/operations/locations/domain/value-objects'
import { OPERATIONS_EVENT_PAYLOADS } from '@contracts/schemas/events/operations-payloads'
import { uuidv7 } from '@platform/uuid'

const actor = { type: 'user' as const, id: uuidv7() }
const businessId = uuidv7()

function makeLocation(overrides: Partial<Parameters<typeof Location.create>[0]> = {}) {
  const created = Location.create({
    id: asLocationId(uuidv7()),
    businessId,
    kind: 'store',
    name: 'Market stall',
    ...overrides,
  }, actor)
  if (!created.ok) throw new Error(created.error.message)
  return created.value
}

/** Every emitted event must satisfy its own registered schema (the D-29 sweep law). */
function expectValidEvents(location: Location) {
  const events = location.pullPendingEvents()
  for (const event of events) {
    const schema = OPERATIONS_EVENT_PAYLOADS[event.eventType]
    expect(schema, `schema registered for ${event.eventType}`).toBeDefined()
    const parsed = schema!.safeParse(event.payload)
    expect(parsed.success, `${event.eventType}: ${!parsed.success ? parsed.error.message : ''}`).toBe(true)
  }
  return events
}

describe('value objects', () => {
  it('name is trimmed and bounded with educating copy', () => {
    expect(createLocationName('  Garage shelf  ')).toMatchObject({ ok: true, value: 'Garage shelf' })
    const bad = createLocationName('x'.repeat(81))
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error.message).toContain('Garage shelf')
  })

  it('address requires street/city/postal and a 2-letter country', () => {
    expect(createAddress({ line1: 'Hoofdstraat 1', city: 'Utrecht', postal: '3511', country: 'nl' }).ok).toBe(true)
    expect(createAddress({ line1: '', city: 'Utrecht', postal: '3511', country: 'NL' }).ok).toBe(false)
    expect(createAddress({ line1: 'H 1', city: 'U', postal: '1', country: 'NLD' }).ok).toBe(false)
  })

  it('operating window must end after it starts', () => {
    const ok = createOperatingWindow({ startsAt: new Date('2026-08-01'), endsAt: new Date('2026-08-03'), timezone: 'Europe/Amsterdam' })
    expect(ok.ok).toBe(true)
    const bad = createOperatingWindow({ startsAt: new Date('2026-08-03'), endsAt: new Date('2026-08-01'), timezone: 'Europe/Amsterdam' })
    expect(bad.ok).toBe(false)
  })
})

describe('creation (L1, L4)', () => {
  it('merchant-created locations are never the default (L1 — the Ghost owns the flag)', () => {
    const location = makeLocation()
    expect(location.isDefault).toBe(false)
    const [created] = expectValidEvents(location)
    expect(created!.eventType).toBe('operations.location.created')
    expect(created!.payload).toMatchObject({ is_default: false, ghost: false, kind: 'store' })
  })

  it('the Ghost is home-kind, default, and evented as ghost (L1 minting path)', () => {
    const ghost = Location.createGhost({ id: asLocationId(uuidv7()), businessId }, { type: 'system', id: 'ops' })
    expect(ghost.isDefault).toBe(true)
    expect(ghost.kind).toBe('home')
    const [created] = expectValidEvents(ghost)
    expect(created!.payload).toMatchObject({ is_default: true, ghost: true })
  })

  it('popup/temporary require an operating window with educating copy (L4)', () => {
    const bad = Location.create({ id: asLocationId(uuidv7()), businessId, kind: 'popup', name: 'Xmas stand' }, actor)
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error.message).toContain('dates')
    const window = createOperatingWindow({ startsAt: new Date('2026-12-01'), endsAt: new Date('2026-12-24'), timezone: 'Europe/Berlin' })
    expect(window.ok).toBe(true)
    if (window.ok) {
      expect(makeLocation({ kind: 'popup', operatingWindow: window.value }).operatingWindow).not.toBeNull()
    }
  })

  it('partner locations refuse manual stock by vocabulary (L3)', () => {
    expect(makeLocation({ kind: 'partner' }).acceptsManualStock).toBe(false)
    expect(makeLocation({ kind: 'warehouse' }).acceptsManualStock).toBe(true)
  })
})

describe('update (D-29 detected change)', () => {
  it('reports only the fields that actually changed; identical values emit nothing', () => {
    const location = makeLocation()
    location.pullPendingEvents()

    const noop = location.update({ name: 'Market stall' }, actor)
    expect(noop.ok).toBe(true)
    expect(location.pullPendingEvents()).toHaveLength(0)

    const changed = location.update({ name: 'Saturday stall', pickupInstructions: 'Ring twice' }, actor)
    expect(changed.ok).toBe(true)
    const [event] = expectValidEvents(location)
    expect(event!.payload).toMatchObject({ fields_changed: ['name', 'pickup_instructions'] })
    expect(location.sequence).toBe(1)
  })

  it('time-boxed locations cannot drop their window (L4)', () => {
    const window = createOperatingWindow({ startsAt: new Date('2026-12-01'), endsAt: new Date('2026-12-24'), timezone: 'Europe/Berlin' })
    if (!window.ok) throw new Error('window')
    const popup = makeLocation({ kind: 'popup', operatingWindow: window.value })
    const dropped = popup.update({ operatingWindow: null }, actor)
    expect(dropped.ok).toBe(false)
  })
})

describe('close (L1, L2)', () => {
  it('refuses while stock remains, with the educating LOCATION_HAS_STOCK answer (L2)', () => {
    const location = makeLocation()
    const refused = location.close(true, actor)
    expect(refused.ok).toBe(false)
    if (!refused.ok) {
      expect(refused.error.code).toBe('LOCATION_HAS_STOCK')
      expect(refused.error.message).toContain('transfer')
    }
  })

  it('the default location refuses to close (L1 stays whole)', () => {
    const ghost = Location.createGhost({ id: asLocationId(uuidv7()), businessId }, { type: 'system', id: 'ops' })
    const refused = ghost.close(false, actor)
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.error.code).toBe('CONFLICT')
  })

  it('closes cleanly without stock; re-close is a silent no-op; closed is read-only', () => {
    const location = makeLocation()
    location.pullPendingEvents()
    expect(location.close(false, actor).ok).toBe(true)
    const [closed] = expectValidEvents(location)
    expect(closed!.eventType).toBe('operations.location.closed')

    expect(location.close(false, actor).ok).toBe(true)
    expect(location.pullPendingEvents()).toHaveLength(0) // idempotent, eventless

    const edit = location.update({ name: 'Zombie' }, actor)
    expect(edit.ok).toBe(false)
    if (!edit.ok) expect(edit.error.code).toBe('INVALID_TRANSITION')
  })
})

describe('hardening (REVIEW-OPS-001)', () => {
  it('addressEquals is key-order independent; stringify is not (H-1 / D-39)', () => {
    const fresh = { line1: 'Hoofdstraat 1', line2: null, city: 'Utrecht', region: null, postal: '3511', country: 'NL' }
    // jsonb canonical order (length, then bytes) — as PostgreSQL returns it
    const roundTripped = { city: 'Utrecht', line1: 'Hoofdstraat 1', line2: null, postal: '3511', region: null, country: 'NL' }
    expect(JSON.stringify(fresh) === JSON.stringify(roundTripped)).toBe(false) // the trap
    expect(addressEquals(fresh, roundTripped)).toBe(true)                      // the law
    expect(addressEquals(fresh, { ...roundTripped, postal: '3512' })).toBe(false)
    expect(operatingWindowEquals(
      { startsAt: new Date('2026-12-01'), endsAt: new Date('2026-12-24'), timezone: 'Europe/Berlin' },
      { startsAt: new Date('2026-12-01T00:00:00.000Z'), endsAt: new Date('2026-12-24T00:00:00.000Z'), timezone: 'Europe/Berlin' },
    )).toBe(true)
  })

  it('the first merchant-authored change clears system_authored; system actors do not (M-1 / D-39)', () => {
    const ghost = Location.createGhost({ id: asLocationId(uuidv7()), businessId }, { type: 'system', id: 'ops' })
    ghost.pullPendingEvents()
    expect(ghost.systemAuthored).toBe(true)

    const systemTouch = ghost.update({ pickupInstructions: 'system note' }, { type: 'system', id: 'ops' })
    expect(systemTouch.ok).toBe(true)
    expect(ghost.systemAuthored).toBe(true) // system edits keep the ghost invisible

    const merchantTouch = ghost.update({ name: 'My kitchen' }, actor)
    expect(merchantTouch.ok).toBe(true)
    expect(ghost.systemAuthored).toBe(false) // a location someone named is a location they know

    const noop = ghost.update({ name: 'My kitchen' }, actor)
    expect(noop.ok).toBe(true) // and no-ops never cleared it in the first place (order matters)
  })
})

