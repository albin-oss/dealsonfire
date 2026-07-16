/**
 * Actor — who is performing a command. Mandatory on every event and audit row (ADR-001 §5.5).
 * AI acts as a first-class actor type: there is no AI side door (ADR §13.3).
 */
import type { MembershipId } from './ids'

export type ActorType = 'user' | 'ai_agent' | 'admin' | 'system' | 'guest'

export interface Actor {
  readonly type: ActorType
  readonly id: string // user_id | ai agent id | admin id | subsystem name | visitor_id (guest)
  readonly membershipId?: MembershipId
}

export const systemActor = (subsystem: string): Actor => ({ type: 'system', id: subsystem })
