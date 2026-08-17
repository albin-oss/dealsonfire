/**
 * The legal document registry (C12-3) — code, not a CMS. Each entry names a
 * document the platform relies on and the version consent facts reference.
 * WORDING IS NOT APPROVED FOR PUBLIC LAUNCH: every page ships placeholder
 * copy behind the Founder/counsel gate; versions turn real when wording does.
 * Acceptance semantics (which actions require which documents at which
 * surfaces) are counsel-configurable data here — never scattered in UI.
 */
export const LEGAL_DOCUMENTS = {
  terms: { id: 'terms', version: '0-draft-placeholder', title: 'Terms of Service', path: '/legal/terms' },
  privacy: { id: 'privacy', version: '0-draft-placeholder', title: 'Privacy', path: '/legal/privacy' },
  returns: { id: 'returns', version: '0-draft-placeholder', title: 'Returns & Withdrawal', path: '/legal/returns' },
  impressum: { id: 'impressum', version: '0-draft-placeholder', title: 'Operator Identity', path: '/legal/impressum' },
} as const

/** Registration records these facts (the acceptance mechanism exists; the
 *  wording gate decides when it may face the public). */
export const REGISTRATION_CONSENTS = [
  { document: LEGAL_DOCUMENTS.terms, action: 'accepted' as const },
  { document: LEGAL_DOCUMENTS.privacy, action: 'acknowledged' as const },
]
