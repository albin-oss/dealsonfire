/**
 * Identity crypto (WP-R1-B1 T-2 decision, recorded D-40): argon2id via hash-wasm (pure
 * WASM — no native build, deterministic across environments) for passwords; sha-256 for
 * opaque tokens (sessions/recovery/guest) with constant-time comparison. Infrastructure
 * layer — the domain sees only the PasswordHasher/TokenHasher ports.
 *
 * argon2id parameters (OWASP 2024 baseline): m=19456 KiB, t=2, p=1 — ~50ms server-side,
 * inside the AC-1.4 p95 ≤ 400ms budget with headroom.
 */
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { argon2id, argon2Verify } from 'hash-wasm'
import type { PasswordHasher, TokenHasher } from '../domain/ports'

const ARGON2 = { parallelism: 1, iterations: 2, memorySize: 19456, hashLength: 32 } as const

export class Argon2PasswordHasher implements PasswordHasher {
  async hash(plaintext: string): Promise<string> {
    return argon2id({
      password: plaintext,
      salt: randomBytes(16),
      ...ARGON2,
      outputType: 'encoded',
    })
  }

  async verify(plaintext: string, encoded: string): Promise<boolean> {
    try {
      return await argon2Verify({ password: plaintext, hash: encoded })
    } catch {
      return false // malformed stored hash → deny, never throw into auth
    }
  }
}

export class Sha256TokenHasher implements TokenHasher {
  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  generate(): string {
    // 32 bytes = 256-bit entropy, url-safe
    return randomBytes(32).toString('base64url')
  }
}

/** Constant-time equality for hashed-token lookups where the caller compares digests. */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}
