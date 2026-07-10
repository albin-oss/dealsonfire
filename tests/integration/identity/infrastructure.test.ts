/**
 * R1-B1-P3 infrastructure integration tests (§7): the port implementations against
 * REAL embedded PostgreSQL — no mocked repositories. Repository round-trips, aggregate
 * rehydration, optimistic concurrency (sequence guard), session lifecycle, single-use
 * token consumption, claim idempotency, the email transport, and WebAuthn option
 * generation. Adapters are exercised directly (not through the application services).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import type { Container } from '../../../server/utils/container'
import { PgUserRepository } from '@domains/identity/infrastructure/user-repository'
import { PgSessionStore } from '@domains/identity/infrastructure/session-store'
import { PgRecoveryStore, PgGuestTokenStore, PgClaimStore } from '@domains/identity/infrastructure/token-stores'
import { SandboxEmailProvider, TransactionalEmail } from '@domains/identity/infrastructure/email'
import { WebAuthnService, MemoryChallengeStore } from '@domains/identity/infrastructure/webauthn'
import { Sha256TokenHasher } from '@domains/identity/infrastructure/crypto'
import { User } from '@domains/identity/domain/user'
import { asUserId } from '@domains/identity/shared-kernel/ids'
import { Session } from '@domains/identity/domain/session'
import { uuidv7 } from '@platform/uuid'

let container: Container
const tx = <T>(fn: (t: unknown) => Promise<T>) => container.deps.uow.withTransaction(fn)
const tokens = new Sha256TokenHasher()
const actor = { type: 'system' as const, id: 'test' }

beforeAll(() => { container = newTestContainer() })
afterAll(async () => { await container.shutdown() })
beforeEach(() => truncateAll(container.pool))

async function seedUser(email = `u-${uuidv7()}@example.com`) {
  const users = new PgUserRepository()
  const user = User.register({ id: asUserId(uuidv7()), email, displayName: 'Rosa', source: 'direct' }, actor)
  await tx((t) => users.insert(t, user, 'hashed-pw'))
  return { user, users }
}

describe('PgUserRepository', () => {
  it('round-trips: insert → findById → findActiveByEmail (rehydrated aggregate)', async () => {
    const { user, users } = await seedUser('rosa@example.com')
    const byId = await tx((t) => users.findById(t, user.id))
    expect(byId?.email).toBe('rosa@example.com')
    expect(byId?.displayName).toBe('Rosa')
    const byEmail = await tx((t) => users.findActiveByEmail(t, 'rosa@example.com'))
    expect(byEmail?.id).toBe(user.id)
    expect(await tx((t) => users.findActiveByEmail(t, 'nobody@example.com'))).toBeNull()
  })

  it('stores and reads the password hash separately from the aggregate', async () => {
    const { user, users } = await seedUser()
    expect(await tx((t) => users.getPasswordHash(t, user.id))).toBe('hashed-pw')
    await tx((t) => users.setPasswordHash(t, user.id, 'rotated'))
    expect(await tx((t) => users.getPasswordHash(t, user.id))).toBe('rotated')
  })

  it('optimistic concurrency: a stale update trips the sequence guard', async () => {
    const { user, users } = await seedUser()
    const [a, b] = await Promise.all([
      tx((t) => users.findById(t, user.id)),
      tx((t) => users.findById(t, user.id)),
    ])
    a!.verifyEmail(); b!.verifyEmail()
    await tx((t) => users.update(t, a!))
    await expect(tx((t) => users.update(t, b!))).rejects.toThrow(/concurrent modification/)
  })

  it('status corruption is refused at the DB (CHECK, rule 23) — the guard cannot be reached from here', async () => {
    const { user } = await seedUser()
    // The users.status CHECK is the big brother; unknown statuses never reach a row, so
    // the repository's rehydration guard has no corruption to catch on this column (the
    // guard's real territory is unconstrained data — none on this aggregate this batch).
    await expect(container.pool.query(`UPDATE users SET status = 'teleported' WHERE id = $1`, [user.id]))
      .rejects.toMatchObject({ code: '23514' })
  })
})

describe('PgSessionStore (lifecycle)', () => {
  it('create → find active → touch → revoke; revoked no longer resolves', async () => {
    const { user } = await seedUser()
    const store = new PgSessionStore()
    const token = tokens.generate()
    const id = uuidv7()
    const { rollingExpiresAt, absoluteExpiresAt } = Session.initialExpiry(new Date())
    await tx((t) => store.create(t, { id, userId: user.id, tokenHash: tokens.hash(token), stepUp: false, rollingExpiresAt, absoluteExpiresAt, userAgent: 'test' }))

    const found = await tx((t) => store.findActiveByTokenHash(t, tokens.hash(token)))
    expect(found?.id).toBe(id)
    await tx((t) => store.touch(t, id, new Date(Date.now() + 1000)))
    await tx((t) => store.revoke(t, id))
    expect(await tx((t) => store.findActiveByTokenHash(t, tokens.hash(token)))).toBeNull()
  })

  it('revokeAllForUser revokes every session but optionally keeps the current one', async () => {
    const { user } = await seedUser()
    const store = new PgSessionStore()
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const id = uuidv7(); ids.push(id)
      const token = tokens.generate()
      const { rollingExpiresAt, absoluteExpiresAt } = Session.initialExpiry(new Date())
      await tx((t) => store.create(t, { id, userId: user.id, tokenHash: tokens.hash(token), stepUp: false, rollingExpiresAt, absoluteExpiresAt, userAgent: null }))
    }
    const revoked = await tx((t) => store.revokeAllForUser(t, user.id, ids[0]!))
    expect(revoked).toBe(2) // kept the current one
    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL`, [user.id])
    expect(rows[0].n).toBe(1)
  })
})

describe('token stores (single-use + idempotency)', () => {
  it('recovery token is single-use; a second consume returns null', async () => {
    const { user } = await seedUser()
    const store = new PgRecoveryStore()
    const token = tokens.generate()
    await tx((t) => store.create(t, { id: uuidv7(), userId: user.id, tokenHash: tokens.hash(token), purpose: 'password_reset', expiresAt: new Date(Date.now() + 60000) }))
    expect(await tx((t) => store.consume(t, tokens.hash(token), 'password_reset'))).toBe(user.id)
    expect(await tx((t) => store.consume(t, tokens.hash(token), 'password_reset'))).toBeNull() // spent
  })

  it('expired recovery token does not consume', async () => {
    const { user } = await seedUser()
    const store = new PgRecoveryStore()
    const token = tokens.generate()
    await tx((t) => store.create(t, { id: uuidv7(), userId: user.id, tokenHash: tokens.hash(token), purpose: 'password_reset', expiresAt: new Date(Date.now() - 1000) }))
    expect(await tx((t) => store.consume(t, tokens.hash(token), 'password_reset'))).toBeNull()
  })

  it('guest token resolves to its scope', async () => {
    const store = new PgGuestTokenStore()
    const token = tokens.generate()
    const ref = uuidv7()
    await tx((t) => store.create(t, { id: uuidv7(), tokenHash: tokens.hash(token), scopeType: 'order', scopeRef: ref, expiresAt: new Date(Date.now() + 60000) }))
    expect(await tx((t) => store.resolve(t, tokens.hash(token)))).toMatchObject({ scopeType: 'order', scopeRef: ref })
    expect(await tx((t) => store.resolve(t, tokens.hash('other')))).toBeNull()
  })

  it('claim is idempotent: first claims, repeat returns already', async () => {
    const { user } = await seedUser()
    const store = new PgClaimStore()
    const claimRef = uuidv7()
    expect(await tx((t) => store.claim(t, { id: uuidv7(), userId: user.id, claimType: 'ignite_draft', claimRef }))).toBe('claimed')
    expect(await tx((t) => store.claim(t, { id: uuidv7(), userId: user.id, claimType: 'ignite_draft', claimRef }))).toBe('already')
  })
})

describe('email adapter', () => {
  it('renders and delivers the reset/verify templates to the provider', async () => {
    const provider = new SandboxEmailProvider()
    const email = new TransactionalEmail(provider, 'https://dof.dev')
    // the adapter builds the link itself from baseUrl + token (the contract): the caller
    // supplies the token, never a pre-built URL — so a wrong base can never be emailed.
    await email.send({ to: 'rosa@example.com', template: 'reset', vars: { token: 'abc123' } })
    await email.send({ to: 'rosa@example.com', template: 'verify', vars: { token: 'xyz789' } })
    expect(provider.outbox).toHaveLength(2)
    expect(provider.outbox[0]!.subject).toMatch(/reset/i)
    expect(provider.outbox[0]!.body).toContain('https://dof.dev/reset?token=abc123')
    expect(provider.outbox[1]!.subject).toMatch(/confirm/i)
    expect(provider.outbox[1]!.body).toContain('https://dof.dev/verify?token=xyz789')
  })
})

describe('WebAuthn adapter (option generation)', () => {
  it('generates registration + authentication options with real challenges', async () => {
    const svc = new WebAuthnService({ rpId: 'localhost', rpName: 'DOF', origin: 'http://localhost:3000' }, new MemoryChallengeStore())
    const reg = await svc.registrationOptions(uuidv7(), 'rosa@example.com', [])
    expect(reg.challengeId).toBeTruthy()
    expect((reg.options as { challenge: string }).challenge.length).toBeGreaterThan(0)
    const auth = await svc.authenticationOptions()
    expect(auth.challengeId).toBeTruthy()
    expect((auth.options as { challenge: string }).challenge.length).toBeGreaterThan(0)
  })
})
