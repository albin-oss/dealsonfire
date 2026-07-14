/**
 * AttributeSet aggregate (PROMPT-016, Catalog Management). A business-scoped, reusable
 * template of typed attribute definitions a merchant applies to products — the "Typed Product
 * Attributes" primitive. Taxonomy-agnostic (ADR-002 O2-1 untouched): sets are owned by the
 * business, not keyed to the platform category tree. Pure: validation + versioned transitions,
 * no persistence. `validate()` is how an open jsonb attribute bag becomes typed and safe.
 */
import { type Result, ok, err } from '../../../../shared/result'
import { domainError, type DomainError } from '../../../../shared/errors'
import type { AttributeSetId } from '../../shared-kernel/ids'
import type { BusinessId } from '../../../merchant/shared-kernel/ids'

export const ATTRIBUTE_TYPES = ['text', 'number', 'boolean', 'select'] as const
export type AttributeType = typeof ATTRIBUTE_TYPES[number]

export interface AttributeDefinition {
  readonly key: string
  readonly label: string
  readonly type: AttributeType
  readonly required: boolean
  readonly allowedValues?: readonly string[] // required for 'select'
}

const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/
const MAX_DEFINITIONS = 50

/** Validate & normalize a raw definition list (from API or rehydration). */
export function createDefinitions(raw: unknown): Result<AttributeDefinition[], DomainError> {
  if (!Array.isArray(raw)) return err(domainError('VALIDATION_FAILED', 'definitions must be a list'))
  if (raw.length > MAX_DEFINITIONS) return err(domainError('VALIDATION_FAILED', `at most ${MAX_DEFINITIONS} attributes per set`))
  const out: AttributeDefinition[] = []
  const seen = new Set<string>()
  for (const d of raw as Record<string, unknown>[]) {
    const key = String(d?.key ?? '')
    if (!KEY_RE.test(key)) return err(domainError('VALIDATION_FAILED', `invalid attribute key "${key}"`))
    if (seen.has(key)) return err(domainError('VALIDATION_FAILED', `duplicate attribute key "${key}"`))
    seen.add(key)
    const type = d?.type as AttributeType
    if (!ATTRIBUTE_TYPES.includes(type)) return err(domainError('VALIDATION_FAILED', `invalid type for "${key}"`))
    const label = String(d?.label ?? '').trim()
    if (label.length < 1 || label.length > 80) return err(domainError('VALIDATION_FAILED', `invalid label for "${key}"`))
    let allowedValues: string[] | undefined
    if (type === 'select') {
      if (!Array.isArray(d?.allowedValues) || d.allowedValues.length === 0) {
        return err(domainError('VALIDATION_FAILED', `select attribute "${key}" needs allowedValues`))
      }
      allowedValues = d.allowedValues.map((v) => String(v))
    }
    out.push(Object.freeze({ key, label, type, required: Boolean(d?.required), allowedValues }))
  }
  return ok(out)
}

export interface AttributeSetProps {
  id: AttributeSetId
  businessId: BusinessId
  name: string
  definitions: AttributeDefinition[]
  status: 'active' | 'archived'
  sequence: number
}

export class AttributeSet {
  private constructor(private readonly props: AttributeSetProps) {}

  static create(input: { id: AttributeSetId; businessId: BusinessId; name: string; definitions: AttributeDefinition[] }): Result<AttributeSet, DomainError> {
    const name = input.name.trim()
    if (name.length < 1 || name.length > 80) return err(domainError('VALIDATION_FAILED', 'name fits in 1–80 characters'))
    return ok(new AttributeSet({ id: input.id, businessId: input.businessId, name, definitions: input.definitions, status: 'active', sequence: 0 }))
  }

  static rehydrate(props: AttributeSetProps): AttributeSet {
    if (!props.id || !props.businessId) throw new Error('corrupt attribute_set row: missing id/business')
    if (props.status !== 'active' && props.status !== 'archived') throw new Error(`corrupt attribute_set row: status=${props.status}`)
    if (!Number.isInteger(props.sequence) || props.sequence < 0) throw new Error(`corrupt attribute_set row: sequence=${props.sequence}`)
    return new AttributeSet(props)
  }

  get id() { return this.props.id }
  get businessId() { return this.props.businessId }
  get name() { return this.props.name }
  get status() { return this.props.status }
  get sequence() { return this.props.sequence }
  get definitions(): readonly AttributeDefinition[] { return this.props.definitions }

  rename(raw: string): Result<boolean, DomainError> {
    const name = raw.trim()
    if (name.length < 1 || name.length > 80) return err(domainError('VALIDATION_FAILED', 'name fits in 1–80 characters'))
    if (name === this.props.name) return ok(false) // no-op (D-29)
    this.props.name = name
    this.props.sequence += 1
    return ok(true)
  }

  replaceDefinitions(definitions: AttributeDefinition[]): void {
    this.props.definitions = definitions
    this.props.sequence += 1
  }

  archive(): boolean {
    if (this.props.status === 'archived') return false
    this.props.status = 'archived'
    this.props.sequence += 1
    return true
  }

  /**
   * The heart of "Typed Product Attributes": validate an open attribute bag against this set.
   * Unknown keys are rejected, required keys must be present, and each value must match its
   * declared type / allowed values. Returns the normalized attributes on success.
   */
  validate(attributes: Record<string, unknown>): Result<Record<string, unknown>, DomainError> {
    const byKey = new Map(this.props.definitions.map((d) => [d.key, d]))
    for (const key of Object.keys(attributes)) {
      if (!byKey.has(key)) return err(domainError('VALIDATION_FAILED', `unknown attribute "${key}" for set "${this.props.name}"`, { key }))
    }
    const out: Record<string, unknown> = {}
    for (const def of this.props.definitions) {
      const present = Object.prototype.hasOwnProperty.call(attributes, def.key)
      if (!present) {
        if (def.required) return err(domainError('VALIDATION_FAILED', `missing required attribute "${def.key}"`, { key: def.key }))
        continue
      }
      const value = attributes[def.key]
      const typeErr = checkType(def, value)
      if (typeErr) return err(domainError('VALIDATION_FAILED', typeErr, { key: def.key }))
      out[def.key] = value
    }
    return ok(out)
  }

  toProps(): AttributeSetProps {
    return { ...this.props, definitions: [...this.props.definitions] }
  }
}

function checkType(def: AttributeDefinition, value: unknown): string | null {
  switch (def.type) {
    case 'text':
      return typeof value === 'string' && value.length <= 500 ? null : `"${def.key}" must be text (≤500 chars)`
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : `"${def.key}" must be a number`
    case 'boolean':
      return typeof value === 'boolean' ? null : `"${def.key}" must be true/false`
    case 'select':
      return typeof value === 'string' && def.allowedValues!.includes(value) ? null : `"${def.key}" must be one of: ${def.allowedValues!.join(', ')}`
  }
}
