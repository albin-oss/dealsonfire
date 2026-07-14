/**
 * PgAttributeSetRepository + PgBrandRefRepository (PROMPT-016). Persistence-only: insert,
 * rehydrate (corruption-guarded by the aggregate), optimistic-concurrency update, list.
 */
import type { Tx } from '../../../../platform/types'
import { asClient } from '../../../../platform/db'
import { InfrastructureError } from '../../../../shared/errors'
import { AttributeSet, type AttributeDefinition, createDefinitions } from '../domain/attribute-set'
import type { BrandRefProps } from '../domain/brand-ref'
import { asAttributeSetId, asBrandRefId } from '../../shared-kernel/ids'
import { asBusinessId, type BusinessId } from '../../../merchant/shared-kernel/ids'

interface SetRow { id: string; business_id: string; name: string; definitions: unknown; status: string; sequence: string }

function rehydrateSet(row: SetRow): AttributeSet {
  const defs = createDefinitions(row.definitions)
  if (!defs.ok) throw new InfrastructureError(`corrupt attribute_set ${row.id}: bad definitions`, { retryable: false })
  return AttributeSet.rehydrate({
    id: asAttributeSetId(row.id),
    businessId: asBusinessId(row.business_id),
    name: row.name,
    definitions: defs.value,
    status: row.status === 'archived' ? 'archived' : 'active',
    sequence: Number(row.sequence),
  })
}

export class PgAttributeSetRepository {
  async insert(tx: Tx, set: AttributeSet): Promise<void> {
    const p = set.toProps()
    await asClient(tx).query(
      `INSERT INTO attribute_sets (id, business_id, name, definitions, status, sequence)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [p.id, p.businessId, p.name, JSON.stringify(p.definitions), p.status, p.sequence])
  }

  async findById(tx: Tx, id: string, opts?: { forUpdate?: boolean }): Promise<AttributeSet | null> {
    const { rows } = await asClient(tx).query<SetRow>(
      `SELECT id, business_id, name, definitions, status, sequence FROM attribute_sets WHERE id = $1${opts?.forUpdate ? ' FOR UPDATE' : ''}`, [id])
    return rows[0] ? rehydrateSet(rows[0]) : null
  }

  async update(tx: Tx, set: AttributeSet): Promise<void> {
    const p = set.toProps()
    const { rowCount } = await asClient(tx).query(
      `UPDATE attribute_sets SET name = $2, definitions = $3, status = $4, sequence = $5, updated_at = now()
       WHERE id = $1 AND sequence = $5 - 1`,
      [p.id, p.name, JSON.stringify(p.definitions), p.status, p.sequence])
    if (rowCount !== 1) throw new InfrastructureError(`attribute_set ${p.id}: concurrent modification`, { retryable: true })
  }

  async listByBusiness(tx: Tx, businessId: BusinessId): Promise<Array<{ id: string; name: string; definitions: AttributeDefinition[]; status: string }>> {
    const { rows } = await asClient(tx).query<SetRow>(
      `SELECT id, business_id, name, definitions, status, sequence FROM attribute_sets
       WHERE business_id = $1 AND status = 'active' ORDER BY name`, [businessId])
    return rows.map((r) => { const s = rehydrateSet(r); return { id: s.id, name: s.name, definitions: [...s.definitions], status: s.status } })
  }
}

export class PgBrandRefRepository {
  /** Idempotent by (business, name): a repeat insert returns the existing row's id. */
  async insert(tx: Tx, brand: BrandRefProps): Promise<string> {
    const { rows } = await asClient(tx).query<{ id: string }>(
      `INSERT INTO brand_refs (id, business_id, name) VALUES ($1, $2, $3)
       ON CONFLICT (business_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [brand.id, brand.businessId, brand.name])
    return rows[0]!.id
  }

  async listByBusiness(tx: Tx, businessId: BusinessId): Promise<Array<{ id: string; name: string }>> {
    const { rows } = await asClient(tx).query<{ id: string; name: string }>(
      `SELECT id, name FROM brand_refs WHERE business_id = $1 ORDER BY name`, [businessId])
    return rows.map((r) => ({ id: asBrandRefId(r.id), name: r.name }))
  }
}
