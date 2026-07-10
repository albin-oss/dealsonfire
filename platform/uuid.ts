/**
 * UUID v7 (RFC 9562) — canonical platform implementation (moved from merchant shared-kernel
 * in Batch 1; merchant re-exports for compatibility). Time-ordered, app-generated (A4).
 * NOT monotonic within one millisecond — ordering-sensitive tables use a DB `seq` (D-15).
 */
import { randomBytes } from 'node:crypto'

export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16)
  bytes[0] = (now / 2 ** 40) & 0xff
  bytes[1] = (now / 2 ** 32) & 0xff
  bytes[2] = (now / 2 ** 24) & 0xff
  bytes[3] = (now / 2 ** 16) & 0xff
  bytes[4] = (now / 2 ** 8) & 0xff
  bytes[5] = now & 0xff
  bytes[6] = (bytes[6]! & 0x0f) | 0x70 // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // variant 10
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (value: string): boolean => UUID_RE.test(value)
