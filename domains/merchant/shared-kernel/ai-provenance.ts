/**
 * AIProvenance VO (ADR-001 §13.3): which fields AI generated, by what, and whether a
 * human approved them. Makes the AI guardrails auditable; stored as jsonb next to the data.
 */
export interface FieldProvenance {
  readonly model: string
  readonly promptVersion: string
  readonly generatedAt: string // ISO timestamp
  readonly humanApproved: boolean
}

export type AIProvenance = Readonly<Record<string, FieldProvenance>>

export const EMPTY_PROVENANCE: AIProvenance = Object.freeze({})

export function markFieldAIGenerated(
  provenance: AIProvenance,
  field: string,
  meta: Omit<FieldProvenance, 'generatedAt'> & { generatedAt?: string },
): AIProvenance {
  return Object.freeze({
    ...provenance,
    [field]: { generatedAt: meta.generatedAt ?? new Date().toISOString(), model: meta.model, promptVersion: meta.promptVersion, humanApproved: meta.humanApproved },
  })
}

export function approveField(provenance: AIProvenance, field: string): AIProvenance {
  const existing = provenance[field]
  if (!existing) return provenance
  return Object.freeze({ ...provenance, [field]: { ...existing, humanApproved: true } })
}

/**
 * Provenance supersession (REVIEW-003 M-1, D-29): provenance entries are written ONLY by
 * draft acceptance; any direct mutation of the field supersedes them — the content is no
 * longer what the AI wrote, so claiming AI authorship would misattribute (ADR-001 §13.3).
 * Clearing (not flagging) keeps the invariant crisp: presence in AIProvenance ⇔ the
 * current field content is AI-authored.
 */
export function clearFieldProvenance(provenance: AIProvenance, field: string): AIProvenance {
  if (!(field in provenance)) return provenance
  const { [field]: _superseded, ...rest } = provenance
  return Object.freeze(rest)
}
