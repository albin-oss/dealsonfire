/**
 * ADR-004 migration + manifest lint rules, exported as pure functions so tests can feed
 * them intentional bad fixtures (PROMPT 009 §6). The CLI entry is check-data-constitution.mjs.
 */

/** Rule 2: migration naming — NNNN_snake_case.sql, strictly increasing, no duplicates. */
export function lintMigrationNames(names) {
  const violations = []
  const numbers = []
  for (const name of names) {
    const match = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(name)
    if (!match) {
      violations.push(`${name}: migration filename must match NNNN_snake_case.sql`)
      continue
    }
    numbers.push(Number(match[1]))
  }
  const sorted = [...numbers].sort((a, b) => a - b)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1]) violations.push(`duplicate migration number ${String(sorted[i]).padStart(4, '0')}`)
  }
  return violations
}

/** Strip SQL comments and string literals so lint regexes don't fire on prose. */
function stripSqlNoise(sql) {
  return sql
    .replace(/--[^\n]*/g, '')
    .replace(/'(?:[^']|'')*'/g, "''")
}

/**
 * Rules 3, 8, 11, 12, 18 over one migration's SQL.
 * `manifest` = Map(table -> owner) for cross-domain FK + unmanifested checks.
 */
export function lintMigrationSql(name, rawSql, manifest) {
  const violations = []
  const sql = stripSqlNoise(rawSql)
  const lower = sql.toLowerCase()

  // Rule 3: timestamptz only
  const tsStripped = lower.replace(/timestamptz/g, '').replace(/timestamp\s+with\s+time\s+zone/g, '')
  if (/\btimestamp\b/.test(tsStripped)) {
    violations.push(`${name}: 'timestamp' without time zone — use timestamptz (ADR-004 rule 3)`)
  }

  // Rule 11: no native enums
  if (/create\s+type\s+\S+\s+as\s+enum/.test(lower)) {
    violations.push(`${name}: native PostgreSQL ENUM — use text + CHECK (ADR-004 rule 11)`)
  }

  // Rule 12: no cascade deletes
  if (/on\s+delete\s+cascade/.test(lower)) {
    violations.push(`${name}: ON DELETE CASCADE is banned — tombstoning is explicit (ADR-004 rule 12)`)
  }

  // Rule 8: no float money
  for (const line of lower.split('\n')) {
    if (/\b(real|double\s+precision|float4|float8)\b/.test(line)) {
      violations.push(`${name}: floating-point column type — banned platform-wide (ADR-004 rule 8)`)
    }
    if (/(price|amount|money|total|fee)/.test(line) && /\bnumeric\b/.test(line)) {
      violations.push(`${name}: numeric used for money — use bigint minor units (ADR-004 rule 8)`)
    }
  }

  // Rule 18: DROP/RENAME require an explicit deprecation marker comment in the raw file
  if (/\b(drop\s+table|drop\s+column|rename\s+to|rename\s+column)\b/.test(lower)) {
    if (!/deprecation:/i.test(rawSql)) {
      violations.push(`${name}: DROP/RENAME without a '-- deprecation:' marker (ADR-004 rule 18 expand→contract)`)
    }
  }

  // Rules 12/25: FK targets must belong to the same owner as the referencing table
  if (manifest) {
    for (const statement of sql.split(';')) {
      const stmtLower = statement.toLowerCase()
      const tableMatch = /(?:create\s+table(?:\s+if\s+not\s+exists)?|alter\s+table(?:\s+only)?)\s+([a-z0-9_]+)/.exec(stmtLower)
      if (!tableMatch) continue
      const table = tableMatch[1]
      if (stmtLower.includes('partition of')) continue
      for (const ref of stmtLower.matchAll(/references\s+([a-z0-9_]+)/g)) {
        const target = ref[1]
        const tableOwner = manifest.get(table)
        const targetOwner = manifest.get(target)
        if (tableOwner && targetOwner && tableOwner !== targetOwner) {
          violations.push(`${name}: cross-domain foreign key ${table} → ${target} (${tableOwner} → ${targetOwner}) — banned (ADR-004 rule 12)`)
        }
      }
    }
  }

  return violations
}

/** Extract tables created by a migration (ignoring partitions of managed parents). */
export function tablesCreatedBy(rawSql) {
  const sql = stripSqlNoise(rawSql)
  const tables = []
  for (const statement of sql.split(';')) {
    const lower = statement.toLowerCase()
    const match = /create\s+table(?:\s+if\s+not\s+exists)?\s+([a-z0-9_]+)/.exec(lower)
    if (!match) continue
    if (lower.includes('partition of')) continue
    tables.push(match[1])
  }
  return tables
}

/**
 * Rules 20/25: manifest completeness — every migration-created table is manifested with an
 * owner; every manifest entry not marked runner-created exists in some migration.
 */
export function checkManifestCompleteness(manifestEntries, migrationSqlByName) {
  const violations = []
  const manifested = new Map(manifestEntries.map((e) => [e.table, e]))
  const created = new Set()
  for (const [name, sql] of Object.entries(migrationSqlByName)) {
    for (const table of tablesCreatedBy(sql)) {
      created.add(table)
      if (!manifested.has(table)) {
        violations.push(`${name}: table '${table}' is not in contracts/data/manifest.json (ADR-004 rule 25)`)
      }
    }
  }
  for (const entry of manifestEntries) {
    if (entry.created_by) continue // runner-created (schema_migrations)
    if (!created.has(entry.table)) {
      violations.push(`manifest: table '${entry.table}' has no creating migration — stale entry?`)
    }
    for (const field of ['owner', 'class', 'pii_tier', 'retention', 'delete_class']) {
      if (entry[field] === undefined || entry[field] === null || entry[field] === '') {
        violations.push(`manifest: table '${entry.table}' missing required field '${field}' (ADR-004 rule 20)`)
      }
    }
  }
  return violations
}

/** ADR-003 §4 / ADR-004 rule 18: registered event types never disappear; versions never decrease. */
export function checkEventRegistryCompatibility(lock, currentTypes) {
  const violations = []
  for (const [eventType, lockedVersion] of Object.entries(lock)) {
    const current = currentTypes[eventType]
    if (current === undefined) {
      violations.push(`event registry: '${eventType}' was removed — breaking change (ADR-003 §4: deprecate, never delete)`)
    } else if (current < lockedVersion) {
      violations.push(`event registry: '${eventType}' schema_version decreased ${lockedVersion} → ${current}`)
    }
  }
  return violations
}
