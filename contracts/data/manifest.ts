/**
 * Typed loader for the table manifest (ADR-004 rules 20/25). The JSON is the source of
 * truth (readable by the .mjs CI lint without a TS toolchain); this module gives tests
 * and application code a typed view of the same bytes.
 */
import manifestJson from './manifest.json'

export type DataClass = 'aggregate' | 'ledger' | 'event' | 'read_model' | 'operational' | 'registry'
export type PiiTier = 'P0' | 'P1' | 'P2' | 'P3'
export type DeleteClass = 'tombstone' | 'transition' | 'windowed' | 'never'

export interface CrossDomainRef {
  column: string
  target_domain: string
  target_concept: string
  cleanup_event?: string
  reconciliation?: string
}

export interface TableManifestEntry {
  table: string
  owner: string
  class: DataClass
  tenancy_key: string | null
  scope_key?: string
  pii_tier: PiiTier
  pii_columns?: string[]
  pii_note?: string
  retention: string
  delete_class: DeleteClass
  immutability?: string
  partitioning_exception?: string
  created_by?: string
  cross_domain_refs: CrossDomainRef[]
}

export const TABLE_MANIFEST: TableManifestEntry[] = manifestJson.tables as TableManifestEntry[]

export const manifestTableNames = (): Set<string> => new Set(TABLE_MANIFEST.map((t) => t.table))

export const tableOwner = (table: string): string | undefined =>
  TABLE_MANIFEST.find((t) => t.table === table)?.owner
