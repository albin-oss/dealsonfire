/**
 * Handle VO (ADR-001 §5.2): validated, reserved-word-checked, lowercase-normalized.
 * The naming rules Ignite depends on live here and nowhere else.
 */
import { type Result, ok, err } from '../../../shared/result'
import { type DomainError, domainError } from '../../../shared/errors'

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/
const RESERVED = new Set([
  'admin', 'administrator', 'api', 'app', 'dof', 'help', 'ignite', 'internal', 'legal', 'login',
  'moderator', 'official', 'privacy', 'root', 'settings', 'shop', 'spark', 'sparks', 'staff',
  'store', 'stores', 'support', 'system', 'terms', 'workspace', 'www',
])

export type Handle = string & { readonly __handle: true }

export function createHandle(raw: string): Result<Handle, DomainError> {
  const normalized = raw.trim().toLowerCase()
  if (!HANDLE_RE.test(normalized)) {
    return err(domainError('VALIDATION_FAILED',
      'handle must be 3–30 chars, a–z 0–9 and hyphens, starting and ending alphanumeric'))
  }
  if (normalized.includes('--')) {
    return err(domainError('VALIDATION_FAILED', 'handle must not contain consecutive hyphens'))
  }
  if (RESERVED.has(normalized)) {
    return err(domainError('HANDLE_TAKEN', `handle "${normalized}" is reserved`))
  }
  return ok(normalized as Handle)
}
