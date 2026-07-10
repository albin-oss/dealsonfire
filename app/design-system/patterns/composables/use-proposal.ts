/**
 * useProposal — the proposal/approval state machine (ADR-005 §2; DESIGN-SYSTEM-001 §8).
 * Carries the explanation quartet as REQUIRED input: a proposal without intent,
 * evidence, confidence, and assumptions cannot be constructed — unexplainable
 * recommendations are unrenderable (ADR-005 §9.4, DS-11).
 *
 * Enforced here, not in review:
 *  - approval is a human act: approve() never accepts an AI actor
 *  - R3 proposals cannot be AI-initiated (ADR-001 §13.3 in the UI layer)
 *  - declining is consequence-free and typed: 'not_now' | 'not_ever' (teaches the ledger)
 *  - expiry is graceful: stale proposals self-expire (no pile of stale robot work)
 */
import { ref, computed, readonly, onScopeDispose } from 'vue'
import type { RClass, PatternActor } from '../../types'

export type Confidence = 'certain' | 'confident' | 'estimate' | 'guess'
export type DeclineReason = 'not_now' | 'not_ever'
export type ProposalStatus = 'pending' | 'approving' | 'approved' | 'declined' | 'expired'

export interface ProposalInput {
  /** One merchant-language sentence. */
  intent: string
  /** Cited evidence lines (each should be traceable to the merchant's own data). */
  evidence: string[]
  /** What was taken as given and not verified — always rendered (§2.1). */
  assumptions: string[]
  confidence: Confidence
  rClass: RClass
  /** Who produced the proposal. */
  initiator: PatternActor
  expiresAt?: Date
  /** Executes the plan on approval (the domain commands live behind this). */
  onApprove: () => void | Promise<void>
  onDecline?: (reason: DeclineReason) => void
  onExpire?: () => void
}

export function useProposal(input: ProposalInput) {
  if (input.intent.trim() === '' || input.evidence.length === 0) {
    throw new Error('a proposal must carry intent and at least one line of evidence (ADR-005 §2.1)')
  }
  if (input.rClass === 'R3' && input.initiator === 'ai') {
    throw new Error('R3 proposals cannot be AI-initiated at any autonomy setting (ADR-001 §13.3)')
  }

  const status = ref<ProposalStatus>('pending')
  let expiryTimer: ReturnType<typeof setTimeout> | undefined

  if (input.expiresAt) {
    const remaining = input.expiresAt.getTime() - Date.now()
    if (remaining <= 0) status.value = 'expired'
    else {
      expiryTimer = setTimeout(() => {
        if (status.value === 'pending') {
          status.value = 'expired'
          input.onExpire?.()
        }
      }, remaining)
    }
  }

  async function approve(actor: PatternActor = 'user'): Promise<void> {
    if (actor === 'ai') throw new Error('approval is a human act — an AI cannot approve its own proposal (ADR-005 Law 1)')
    if (status.value !== 'pending') return
    status.value = 'approving'
    try {
      await input.onApprove()
      status.value = 'approved'
    } catch (error) {
      status.value = 'pending' // the plan failed; the decision remains the merchant's
      throw error
    }
  }

  function decline(reason: DeclineReason): void {
    if (status.value !== 'pending') return
    status.value = 'declined'
    input.onDecline?.(reason)
  }

  onScopeDispose(() => { if (expiryTimer) clearTimeout(expiryTimer) })

  return {
    status: readonly(status),
    quartet: { intent: input.intent, evidence: input.evidence, assumptions: input.assumptions, confidence: input.confidence },
    rClass: input.rClass,
    actionable: computed(() => status.value === 'pending'),
    approve,
    decline,
  }
}

export type UseProposalReturn = ReturnType<typeof useProposal>
