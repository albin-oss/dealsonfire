/**
 * PgLocationRepository (OPS-001 Batch 1). Kernel repository idioms: whole-row
 * rehydration with a corruption guard, optimistic sequence guard on update, FOR UPDATE
 * option for command loads. Address/window are jsonb VO documents (D-30a precedent).
 */
import type { Tx } from '../../../../platform/types'
import { asClient } from '../../../../platform/db'
import { InfrastructureError } from '../../../../shared/errors'
import { asLocationId, type LocationId } from '../../shared-kernel/ids'
import type { LocationRepository } from '../../shared-kernel/ports'
import { Location } from '../domain/location'
import { LOCATION_KINDS, LOCATION_STATUSES, type Address, type LocationKind, type LocationStatus, type OperatingWindow } from '../domain/value-objects'

interface Row {
  id: string
  business_id: string
  kind: string
  name: string
  address: { line1: string; line2: string | null; city: string; region: string | null; postal: string; country: string } | null
  pickup_instructions: string | null
  operating_window: { starts_at: string; ends_at: string; timezone: string } | null
  status: string
  is_default: boolean
  system_authored: boolean
  sequence: string
}

const COLUMNS = 'id, business_id, kind, name, address, pickup_instructions, operating_window, status, is_default, system_authored, sequence'

function rehydrate(row: Row): Location {
  if (!LOCATION_KINDS.includes(row.kind as LocationKind) || !LOCATION_STATUSES.includes(row.status as LocationStatus)) {
    // rehydration guard (kernel law): a row the domain cannot explain is an outage, not a guess
    throw new InfrastructureError(`corrupt locations row ${row.id}: kind=${row.kind} status=${row.status}`, { retryable: false })
  }
  let window: OperatingWindow | null = null
  if (row.operating_window) {
    const startsAt = new Date(row.operating_window.starts_at)
    const endsAt = new Date(row.operating_window.ends_at)
    // guard the jsonb interior too — CHECK constraints cannot see inside the document
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || !row.operating_window.timezone) {
      throw new InfrastructureError(`corrupt locations row ${row.id}: unreadable operating_window`, { retryable: false })
    }
    window = Object.freeze({ startsAt, endsAt, timezone: row.operating_window.timezone })
  }
  return Location.rehydrate({
    id: asLocationId(row.id),
    businessId: row.business_id,
    kind: row.kind as LocationKind,
    name: row.name,
    address: (row.address as Address | null) ?? null,
    pickupInstructions: row.pickup_instructions,
    operatingWindow: window,
    status: row.status as LocationStatus,
    isDefault: row.is_default,
    systemAuthored: row.system_authored,
    sequence: Number(row.sequence),
  })
}

function windowToJson(window: OperatingWindow | null) {
  return window
    ? { starts_at: window.startsAt.toISOString(), ends_at: window.endsAt.toISOString(), timezone: window.timezone }
    : null
}

export class PgLocationRepository implements LocationRepository {
  async insert(tx: Tx, location: Location): Promise<void> {
    await asClient(tx).query(
      `INSERT INTO locations (id, business_id, kind, name, address, pickup_instructions, operating_window, status, is_default, system_authored, sequence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [location.id, location.businessId, location.kind, location.name, location.address,
       location.pickupInstructions, windowToJson(location.operatingWindow), location.status,
       location.isDefault, location.systemAuthored, location.sequence],
    )
  }

  async update(tx: Tx, location: Location): Promise<void> {
    const { rowCount } = await asClient(tx).query(
      `UPDATE locations
         SET name = $2, address = $3, pickup_instructions = $4, operating_window = $5,
             status = $6, system_authored = $7, sequence = $8, updated_at = now()
       WHERE id = $1 AND sequence = $8 - 1`,
      [location.id, location.name, location.address, location.pickupInstructions,
       windowToJson(location.operatingWindow), location.status, location.systemAuthored, location.sequence],
    )
    if (rowCount !== 1) {
      throw new InfrastructureError(`location ${location.id}: concurrent modification (sequence guard)`, { retryable: true })
    }
  }

  async findById(tx: Tx, id: LocationId, options?: { forUpdate?: boolean }): Promise<Location | null> {
    const { rows } = await asClient(tx).query<Row>(
      `SELECT ${COLUMNS} FROM locations WHERE id = $1${options?.forUpdate ? ' FOR UPDATE' : ''}`,
      [id],
    )
    return rows[0] ? rehydrate(rows[0]) : null
  }

  async listByBusiness(tx: Tx, businessId: string): Promise<Location[]> {
    const { rows } = await asClient(tx).query<Row>(
      `SELECT ${COLUMNS} FROM locations WHERE business_id = $1
       ORDER BY is_default DESC, status = 'active' DESC, created_at ASC`,
      [businessId],
    )
    return rows.map(rehydrate)
  }

  async findDefault(tx: Tx, businessId: string): Promise<Location | null> {
    const { rows } = await asClient(tx).query<Row>(
      `SELECT ${COLUMNS} FROM locations WHERE business_id = $1 AND is_default AND status = 'active'`,
      [businessId],
    )
    return rows[0] ? rehydrate(rows[0]) : null
  }
}
