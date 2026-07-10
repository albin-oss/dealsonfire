/**
 * The Ignite journey state (UI-COM-002): the frozen six-step score (ADR-001 §9,
 * UX-BIBLE §8) as a resumable machine. Drafts persist locally (the server-side
 * ignite_drafts store plugs into the same JourneyPersistence seam when sessions
 * land); back is safe; re-entry lands exactly where the merchant left off.
 */
import { useJourney, type JourneyPersistence } from '@ds/index'
import type { IdentityDraft, RevealItem } from './intelligence'
import type { ImportedProduct } from './import-sources'

export interface IgniteState {
  idea: string
  importSourceId: string | null
  importedProducts: ImportedProduct[]
  importSkipped: number
  identities: IdentityDraft[]
  identityIndex: number | null
  customName: string
  productTitle: string
  priceMinor: number | null
  revealItems: RevealItem[]
  launched: {
    businessId: string
    storeId: string
    handle: string
    storeUrl: string
    productId: string | null
  } | null
}

export const IGNITE_STEPS = ['welcome', 'idea', 'mirror', 'first-thing', 'reveal', 'launch'] as const
export type IgniteStepId = (typeof IGNITE_STEPS)[number]

const DRAFT_KEY = 'dof.ignite-draft'

export function initialIgniteState(): IgniteState {
  return {
    idea: '',
    importSourceId: null,
    importedProducts: [],
    importSkipped: 0,
    identities: [],
    identityIndex: null,
    customName: '',
    productTitle: '',
    priceMinor: null,
    revealItems: [],
    launched: null,
  }
}

/** Local draft store — the JourneyPersistence seam the server implementation replaces. */
export function localDraftStore(): JourneyPersistence<IgniteState> {
  return {
    async load() {
      if (typeof window === 'undefined') return null
      try {
        const raw = window.localStorage.getItem(DRAFT_KEY)
        return raw ? (JSON.parse(raw) as { stepId: string; state: IgniteState }) : null
      } catch {
        return null
      }
    },
    async save(snapshot) {
      if (typeof window === 'undefined') return
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot))
    },
  }
}

export function clearIgniteDraft(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(DRAFT_KEY)
}

export function useIgniteJourney(persistence: JourneyPersistence<IgniteState> = localDraftStore()) {
  return useJourney<IgniteState>({
    steps: [
      { id: 'welcome' },
      { id: 'idea', validate: (s) => s.idea.trim().length >= 3 || 'One sentence is enough — what do you love making or doing?' },
      { id: 'mirror', validate: (s) => s.identityIndex !== null || 'Pick the one that feels like yours — you can rename anytime, nothing locks.' },
      { id: 'first-thing', validate: (s) => (s.productTitle.trim() !== '' && s.priceMinor !== null && s.priceMinor > 0) || 'Give your first thing a name and a starting price — both change anytime.' },
      { id: 'reveal' },
      { id: 'launch' },
    ],
    initialState: initialIgniteState(),
    persistence,
  })
}

/** The chosen identity (custom name overrides the drafted one, keeping its dress). */
export function chosenIdentity(state: IgniteState): IdentityDraft | null {
  if (state.identityIndex === null) return null
  const base = state.identities[state.identityIndex]
  if (!base) return null
  if (state.customName.trim() === '') return base
  return { ...base, name: state.customName.trim() }
}
