/**
 * Stock-movement reason codes — the ledger's vocabulary (BLUEPRINT-003 §2; OPS-001 §2).
 * The FULL list is declared now because it is contract vocabulary shared by every future
 * batch (a const list is the contract, not a placeholder — OPS-001-BLUEPRINT §2);
 * Batch 1 emits none of them (the ledger lands with Batch 2).
 */

export const REASON_CODES = [
  'opening_count',
  'received',
  'sold',
  'adjustment',
  'count',
  'transfer_out',
  'transfer_in',
  'return_restock',
  'oversell_correction',
  'import',
] as const
export type ReasonCode = (typeof REASON_CODES)[number]

export const SUB_REASONS = [
  'damaged',
  'lost',
  'found',
  'correction',
  'import_undo',
  'transfer_variance',
  'other',
] as const
export type SubReason = (typeof SUB_REASONS)[number]
