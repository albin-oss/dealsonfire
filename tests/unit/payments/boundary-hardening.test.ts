/**
 * Pre-C10 hardening (Real Money Readiness Review, immediate fixes):
 * RM-C4 — refund flags derive from the charge's ACTUAL shape; sending
 * reverse_transfer against a plain charge is a Stripe error that would have
 * broken every real refund day one. RM-M5 — the api-version tripwire.
 */
import { describe, it, expect } from 'vitest'
import { refundFlagsFor, apiVersionMismatch, STRIPE_PINNED_API_VERSION } from '@domains/payments/application/payments'

describe('refundFlagsFor (RM-C4)', () => {
  it('plain charge: no transfer to reverse, no fee to refund', () => {
    expect(refundFlagsFor({ transfer: null, application_fee: null }))
      .toEqual({ reverse_transfer: false, refund_application_fee: false })
    expect(refundFlagsFor({})).toEqual({ reverse_transfer: false, refund_application_fee: false })
    expect(refundFlagsFor(null)).toEqual({ reverse_transfer: false, refund_application_fee: false })
    expect(refundFlagsFor(undefined)).toEqual({ reverse_transfer: false, refund_application_fee: false })
  })

  it('destination charge with app fee: both flags join', () => {
    expect(refundFlagsFor({ transfer: 'tr_123', application_fee: 'fee_123' }))
      .toEqual({ reverse_transfer: true, refund_application_fee: true })
    // expanded objects count the same as id strings
    expect(refundFlagsFor({ transfer: { id: 'tr_123' }, application_fee: { id: 'fee_123' } }))
      .toEqual({ reverse_transfer: true, refund_application_fee: true })
  })

  it('destination charge without a fee (launch fee value 0): reverse only', () => {
    expect(refundFlagsFor({ transfer: 'tr_123', application_fee: null }))
      .toEqual({ reverse_transfer: true, refund_application_fee: false })
  })
})

describe('apiVersionMismatch (RM-M5)', () => {
  it('the pin itself never trips; a different version always does', () => {
    expect(apiVersionMismatch(STRIPE_PINNED_API_VERSION)).toBe(false)
    expect(apiVersionMismatch('2027-01-01.zinnia')).toBe(true)
  })
  it('events without a version (old test fixtures) stay quiet', () => {
    expect(apiVersionMismatch(null)).toBe(false)
    expect(apiVersionMismatch(undefined)).toBe(false)
    expect(apiVersionMismatch('')).toBe(false)
  })
})
