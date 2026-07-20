/**
 * Identity branded ids (WP-R1-B1 / EXEC-R1-B1 P1 §4). One brand per identity aggregate/
 * entity so a raw uuid can never silently stand in for the wrong concept. Each `as*`
 * constructor is the sanctioned mint: it validates uuid shape and returns the brand.
 * IDs are application-generated UUIDv7 (ADR-004); these guards accept any uuid layout.
 */
declare const brand: unique symbol
type Branded<T, B> = T & { readonly [brand]: B }

export type UserId = Branded<string, 'UserId'>
export type SessionId = Branded<string, 'SessionId'>
export type CredentialId = Branded<string, 'CredentialId'>
export type PasskeyId = Branded<string, 'PasskeyId'>
export type RecoveryTokenId = Branded<string, 'RecoveryTokenId'>
export type GuestTokenId = Branded<string, 'GuestTokenId'>
export type ClaimId = Branded<string, 'ClaimId'>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function mint<B extends string>(kind: B, value: string): Branded<string, B> {
  if (!UUID_RE.test(value)) throw new Error(`invalid ${kind}: ${value}`)
  return value as Branded<string, B>
}

export const asUserId = (value: string): UserId => mint('UserId', value)
export const asSessionId = (value: string): SessionId => mint('SessionId', value)
export const asCredentialId = (value: string): CredentialId => mint('CredentialId', value)
export const asPasskeyId = (value: string): PasskeyId => mint('PasskeyId', value)
export const asRecoveryTokenId = (value: string): RecoveryTokenId => mint('RecoveryTokenId', value)
export const asGuestTokenId = (value: string): GuestTokenId => mint('GuestTokenId', value)
export const asClaimId = (value: string): ClaimId => mint('ClaimId', value)
