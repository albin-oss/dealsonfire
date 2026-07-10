/** useProposal + useConfirmation — the constitutional enforcement points (DS-5, DS-11). */
import { describe, it, expect, vi } from 'vitest'
import { useProposal } from '@ds/patterns/composables/use-proposal'
import { useConfirmation } from '@ds/patterns/composables/use-confirmation'

const quartet = {
  intent: 'Add a weekend deal.',
  evidence: ['142 views this week'],
  assumptions: ['inventory covers pickup'],
  confidence: 'confident' as const,
}

describe('useProposal', () => {
  it('requires the quartet: no evidence → unrenderable', () => {
    expect(() => useProposal({ ...quartet, evidence: [], rClass: 'R2', initiator: 'ai', onApprove: () => {} }))
      .toThrow(/evidence/)
  })

  it('R3 cannot be AI-initiated at any setting (ADR-001 §13.3)', () => {
    expect(() => useProposal({ ...quartet, rClass: 'R3', initiator: 'ai', onApprove: () => {} }))
      .toThrow(/R3.*AI-initiated/)
  })

  it('approval is a human act — an AI actor is refused', async () => {
    const proposal = useProposal({ ...quartet, rClass: 'R2', initiator: 'ai', onApprove: () => {} })
    await expect(proposal.approve('ai')).rejects.toThrow(/human act/)
    expect(proposal.status.value).toBe('pending')
  })

  it('happy path: approve executes the plan once', async () => {
    const onApprove = vi.fn()
    const proposal = useProposal({ ...quartet, rClass: 'R2', initiator: 'ai', onApprove })
    await proposal.approve('user')
    expect(proposal.status.value).toBe('approved')
    await proposal.approve('user') // idempotent — decided proposals stay decided
    expect(onApprove).toHaveBeenCalledTimes(1)
  })

  it('a failed plan returns the decision to the merchant (pending again)', async () => {
    const proposal = useProposal({ ...quartet, rClass: 'R2', initiator: 'ai', onApprove: () => { throw new Error('boom') } })
    await expect(proposal.approve('user')).rejects.toThrow('boom')
    expect(proposal.status.value).toBe('pending')
  })

  it('declining is consequence-free and typed (teaches the ledger)', () => {
    const reasons: string[] = []
    const proposal = useProposal({ ...quartet, rClass: 'R1', initiator: 'ai', onApprove: () => {}, onDecline: (r) => reasons.push(r) })
    proposal.decline('not_ever')
    expect(proposal.status.value).toBe('declined')
    expect(reasons).toEqual(['not_ever'])
  })

  it('stale proposals self-expire (no pile of stale robot work)', () => {
    vi.useFakeTimers()
    try {
      const onExpire = vi.fn()
      const proposal = useProposal({
        ...quartet, rClass: 'R2', initiator: 'ai', onApprove: () => {},
        expiresAt: new Date(Date.now() + 1000), onExpire,
      })
      vi.advanceTimersByTime(1001)
      expect(proposal.status.value).toBe('expired')
      expect(onExpire).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('useConfirmation', () => {
  it('refuses R0/R1 — reversible actions must not ask first', () => {
    expect(() => useConfirmation({ rClass: 'R1', summary: 'x', onConfirm: () => {} }))
      .toThrow(/refuses R1/)
  })

  it('R3 requires a typed challenge and gates confirm on it', async () => {
    expect(() => useConfirmation({ rClass: 'R3', summary: 'x', onConfirm: () => {} })).toThrow(/typed challenge/)

    const onConfirm = vi.fn()
    const confirmation = useConfirmation({ rClass: 'R3', summary: 'close store', challenge: 'grandma-soaps', onConfirm })
    confirmation.request()
    expect(confirmation.open.value).toBe(true)

    confirmation.typed.value = 'wrong'
    await confirmation.confirm()
    expect(onConfirm).not.toHaveBeenCalled()

    confirmation.typed.value = 'grandma-soaps'
    await confirmation.confirm()
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(confirmation.open.value).toBe(false)
  })

  it('R3 refuses AI initiation; R2 needs no challenge', () => {
    expect(() => useConfirmation({ rClass: 'R3', initiator: 'ai', summary: 'x', challenge: 'x', onConfirm: () => {} }))
      .toThrow(/AI-initiated/)
    const r2 = useConfirmation({ rClass: 'R2', summary: 'publish', onConfirm: () => {} })
    r2.request()
    expect(r2.satisfied.value).toBe(true)
  })
})
