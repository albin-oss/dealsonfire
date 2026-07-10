/**
 * EnsureGhostLocation (BLUEPRINT-003 §0.2; OPS-001 §7): the system-authored invisible
 * default. Idempotent under any concurrency: a per-business advisory lock serializes
 * the check-then-create, and `uq_locations_default` is the big brother underneath.
 * System actor, no gate (CDC-001: the ghost needs no capability — merchants never
 * invoke this; commands and the commerce.product.created consumer do).
 */
import { type Result, ok } from '../../../../../shared/result'
import type { DomainError } from '../../../../../shared/errors'
import type { Tx } from '../../../../../platform/types'
import { asClient } from '../../../../../platform/db'
import { traceFromRequest } from '../../../../../platform/trace'
import { uuidv7 } from '../../../../../platform/uuid'
import type { Actor } from '../../../../merchant/shared-kernel/actor'
import { asLocationId } from '../../../shared-kernel/ids'
import type { OperationsDeps } from '../../../shared-kernel/ports'
import { Location } from '../../domain/location'
import { locationToDTO, type LocationDTO } from '../dto'

const SYSTEM_ACTOR: Actor = { type: 'system', id: 'operations.ghost-location' }

export interface EnsureGhostLocationCommand {
  businessId: string
  requestContext?: Record<string, unknown>
}

/** Core, callable inside an existing transaction (future stock commands compose it). */
export async function ensureGhostLocationInTx(
  deps: OperationsDeps,
  tx: Tx,
  input: EnsureGhostLocationCommand,
): Promise<Result<LocationDTO, DomainError>> {
  // Steady-state short-circuit (REVIEW-OPS-001 M-2 / D-39): once the default exists —
  // the overwhelmingly common case — no lock is taken and no write occurs.
  const fast = await deps.locations.findDefault(tx, input.businessId)
  if (fast) return ok(locationToDTO(fast))

  // Miss: serialize per business (hashtext keeps the key in advisory-lock range),
  // then re-check under the lock before creating.
  await asClient(tx).query(`SELECT pg_advisory_xact_lock(hashtext('ghost-location:' || $1))`, [input.businessId])

  const existing = await deps.locations.findDefault(tx, input.businessId)
  if (existing) return ok(locationToDTO(existing))

  const ghost = Location.createGhost({ id: asLocationId(uuidv7()), businessId: input.businessId }, SYSTEM_ACTOR)
  await deps.locations.insert(tx, ghost)
  await deps.eventStore.append(tx, ghost.pullPendingEvents(), traceFromRequest(input.requestContext))
  await deps.audit.record(tx, {
    businessId: input.businessId, actor: SYSTEM_ACTOR, command: 'operations.location.ensure_ghost',
    sensitivity: 'normal', target: { type: 'location', id: ghost.id },
    afterDigest: { ghost: true },
    context: input.requestContext,
  })
  return ok(locationToDTO(ghost))
}

export function ensureGhostLocationCommand(deps: OperationsDeps) {
  return async (input: EnsureGhostLocationCommand): Promise<Result<LocationDTO, DomainError>> =>
    deps.uow.withTransaction((tx) => ensureGhostLocationInTx(deps, tx, input))
}
