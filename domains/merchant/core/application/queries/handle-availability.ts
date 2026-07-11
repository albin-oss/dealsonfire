/**
 * Handle availability query (PROMPT-008 Ignite: real-time handle selection). Validates the
 * requested handle's shape, reads the ledger (advisory), and — when taken — offers numbered
 * suggestions the UI can present. The authoritative claim stays race-safe in HandleService.
 */
import type { KernelDeps } from '../deps'
import { createHandle } from '../../../shared-kernel/handle'

export interface HandleAvailability {
  handle: string
  available: boolean
  reason: 'ok' | 'invalid_format' | 'taken'
  suggestions: string[]
}

export function handleAvailabilityQuery(deps: KernelDeps) {
  return async (raw: string): Promise<HandleAvailability> => {
    const validated = createHandle(raw.trim().toLowerCase())
    if (!validated.ok) {
      return { handle: raw, available: false, reason: 'invalid_format', suggestions: [] }
    }
    const handle = validated.value
    const { taken } = await deps.uow.withTransaction((tx) => deps.handles.lookup(tx, handle))
    if (!taken) return { handle, available: true, reason: 'ok', suggestions: [] }
    const suggestions = [2, 3, 4]
      .map((n) => createHandle(`${handle.slice(0, 27)}-${n}`))
      .filter((r) => r.ok)
      .map((r) => (r.ok ? r.value : ''))
    return { handle, available: false, reason: 'taken', suggestions }
  }
}
