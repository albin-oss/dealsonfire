/**
 * Option / OptionValue VOs (ADR-002 §2, §6): a Product declares option axes (Color, Size);
 * a Variant is a point in that space. Lives in the commerce shared-kernel (BLUEPRINT-002 §1)
 * because future configurable-product kinds (ADR-002 §6: `custom` options, 2030s) extend
 * this vocabulary, and merchandising rules reference option names.
 */
import { type Result, ok, err } from '../../../shared/result'
import { type DomainError, domainError } from '../../../shared/errors'

export const MAX_OPTIONS_PER_PRODUCT = 3
export const MAX_VALUES_PER_OPTION = 50

const NAME_RE = /^\S(.{0,28}\S)?$/ // 1–30 chars, no leading/trailing whitespace
const VALUE_RE = /^\S(.{0,38}\S)?$/ // 1–40 chars
// eslint-disable-next-line no-control-regex -- rejecting control bytes (incl. tabs) is the point
const OPTION_CONTROL_RE = /[\u0000-\u001F\u007F]/

export type OptionValue = string & { readonly __optionValue: true }

export interface Option {
  readonly name: string
  readonly values: readonly OptionValue[]
}

export function createOptionValue(raw: string): Result<OptionValue, DomainError> {
  const value = raw.trim()
  if (!VALUE_RE.test(value) || OPTION_CONTROL_RE.test(value)) {
    return err(domainError('VALIDATION_FAILED', `option value must be 1–40 characters: "${raw}"`))
  }
  return ok(value as OptionValue)
}

export function createOption(name: string, rawValues: string[]): Result<Option, DomainError> {
  const trimmed = name.trim()
  if (!NAME_RE.test(trimmed) || OPTION_CONTROL_RE.test(trimmed)) {
    return err(domainError('VALIDATION_FAILED', `option name must be 1–30 characters: "${name}"`))
  }
  if (rawValues.length === 0) {
    return err(domainError('VALIDATION_FAILED', `option "${trimmed}" must declare at least one value`))
  }
  if (rawValues.length > MAX_VALUES_PER_OPTION) {
    return err(domainError('VALIDATION_FAILED', `option "${trimmed}" exceeds ${MAX_VALUES_PER_OPTION} values`))
  }
  const values: OptionValue[] = []
  const seen = new Set<string>()
  for (const raw of rawValues) {
    const value = createOptionValue(raw)
    if (!value.ok) return value
    const key = (value.value as string).toLowerCase()
    if (seen.has(key)) {
      return err(domainError('VALIDATION_FAILED', `option "${trimmed}" has duplicate value "${raw}" (case-insensitive)`))
    }
    seen.add(key)
    values.push(value.value)
  }
  return ok(Object.freeze({ name: trimmed, values: Object.freeze(values) }))
}
