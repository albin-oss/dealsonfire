/**
 * Parameterized audit log (BLUEPRINT-002 K1) — each domain writes its own audit table
 * (ADR-003 §3), one implementation. Semantics unchanged from Module 1 (D-10).
 */
import type pg from 'pg'
import type { Tx, AuditLog, AuditEntry } from './types'
import { assertSqlIdentifier } from './types'
import { uuidv7 } from './uuid'
import { asClient } from './db'

export class PgAuditLog implements AuditLog {
  private readonly insertSql: string

  constructor(private readonly pool: pg.Pool, config: { auditTable: string }) {
    const table = assertSqlIdentifier(config.auditTable)
    this.insertSql = `INSERT INTO ${table} (id, business_id, actor, command, sensitivity, target, before_digest, after_digest, context)
                      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
  }

  private params(entry: AuditEntry, extraContext?: Record<string, unknown>) {
    return [
      uuidv7(),
      entry.businessId,
      entry.actor,
      entry.command,
      entry.sensitivity,
      entry.target,
      entry.beforeDigest ?? {},
      entry.afterDigest ?? {},
      { ...(entry.context ?? {}), ...(extraContext ?? {}) },
    ]
  }

  async record(tx: Tx, entry: AuditEntry): Promise<void> {
    await asClient(tx).query(this.insertSql, this.params(entry))
  }

  async recordDenied(entry: AuditEntry & { denialCode: string }): Promise<void> {
    await this.pool.query(this.insertSql, this.params(entry, { denied: true, denial_code: entry.denialCode }))
  }
}
