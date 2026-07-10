/** Identity branded ids (WP-R1-B1). */
declare const brand: unique symbol
type Branded<T, B> = T & { readonly [brand]: B }

export type UserId = Branded<string, 'UserId'>
export type SessionId = Branded<string, 'SessionId'>
export type PasskeyId = Branded<string, 'PasskeyId'>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function asUserId(value: string): UserId {
  if (!UUID_RE.test(value)) throw new Error(`invalid UserId: ${value}`)
  return value as UserId
}
export function asSessionId(value: string): SessionId {
  if (!UUID_RE.test(value)) throw new Error(`invalid SessionId: ${value}`)
  return value as SessionId
}
