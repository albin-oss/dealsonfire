/** Identity crypto + VOs (WP-R1-B1): real argon2id, token hashing, password policy. */
import { describe, it, expect } from 'vitest'
import { Argon2PasswordHasher, Sha256TokenHasher, safeEqualHex } from '@domains/identity/infrastructure/crypto'
import { createEmail, validatePassword, createDisplayName } from '@domains/identity/domain/value-objects'

describe('Argon2PasswordHasher (real argon2id)', () => {
  const hasher = new Argon2PasswordHasher()

  it('hashes to an argon2id encoded string and verifies correctly', async () => {
    const hash = await hasher.hash('correct horse battery staple')
    expect(hash).toMatch(/^\$argon2id\$/)
    expect(await hasher.verify('correct horse battery staple', hash)).toBe(true)
    expect(await hasher.verify('wrong password entirely', hash)).toBe(false)
  })

  it('produces distinct hashes for the same password (random salt)', async () => {
    const [a, b] = await Promise.all([hasher.hash('same-password-x'), hasher.hash('same-password-x')])
    expect(a).not.toBe(b)
    expect(await hasher.verify('same-password-x', a)).toBe(true)
  })

  it('denies (never throws) on ANY malformed stored hash — the P0 load-bearing guard', async () => {
    // P0 proved raw argon2Verify THROWS on garbage; the adapter must wrap → false.
    for (const garbage of ['not-a-hash', '', '$argon2id$broken', 'x'.repeat(20), '$argon2id$v=19$m=1']) {
      await expect(hasher.verify('anything', garbage)).resolves.toBe(false)
    }
  })
})

describe('Sha256TokenHasher', () => {
  const t = new Sha256TokenHasher()
  it('generates ≥256-bit url-safe tokens and hashes deterministically', () => {
    const token = t.generate()
    expect(token.length).toBeGreaterThanOrEqual(43) // 32 bytes base64url
    expect(t.hash(token)).toBe(t.hash(token))
    expect(t.hash(token)).not.toBe(token) // stored form ≠ plaintext
    expect(t.generate()).not.toBe(t.generate())
  })
  it('safeEqualHex compares equal-length hex constant-time', () => {
    const h = t.hash('x')
    expect(safeEqualHex(h, h)).toBe(true)
    expect(safeEqualHex(h, t.hash('y'))).toBe(false)
    expect(safeEqualHex(h, 'short')).toBe(false)
  })
})

describe('value objects', () => {
  it('email normalizes and validates', () => {
    expect(createEmail('  Rosa@Example.COM ')).toMatchObject({ ok: true, value: 'rosa@example.com' })
    expect(createEmail('nope').ok).toBe(false)
  })
  it('password policy: length floor + breach-list deny, no composition rules', () => {
    expect(validatePassword('a nice long passphrase').ok).toBe(true)
    expect(validatePassword('short').ok).toBe(false)
    expect(validatePassword('password123').ok).toBe(false) // breach list
    expect(validatePassword('12!Aa').ok).toBe(false) // too short despite "complexity"
  })
  it('display name is optional and bounded', () => {
    expect(createDisplayName(null)).toMatchObject({ ok: true, value: null })
    expect(createDisplayName('  Rosa  ')).toMatchObject({ ok: true, value: 'Rosa' })
    expect(createDisplayName('x'.repeat(81)).ok).toBe(false)
  })
})
