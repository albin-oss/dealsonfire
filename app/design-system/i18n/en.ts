/**
 * Design-system message catalog (DESIGN-SYSTEM-001 §1.1, §11: zero concatenated
 * strings; every component string lives here so localization is a catalog swap,
 * not a refactor). Feature copy does NOT belong here — this is chrome vocabulary.
 * The `ignite` namespace seeds the one-voice rule (§8): calibrated confidence
 * phrases are an enum, so calibration is consistent platform-wide.
 */

export const DS_MESSAGES = {
  nav: {
    skipToContent: 'Skip to content',
    more: 'More',
  },
  palette: {
    placeholder: 'Search or jump to…',
    recent: 'Recent',
    noResults: 'Nothing matches — try fewer letters, or press Esc and use the navigation.',
    open: 'Search and commands',
  },
  notifications: {
    title: 'Notifications',
    empty: 'Nothing needs you. Enjoy the day.',
    open: 'Open notifications',
  },
  input: {
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    clearSearch: 'Clear search',
    increment: 'Increase',
    decrement: 'Decrease',
    moneyHint: 'Enter a price like 14.99',
  },
  common: {
    undo: 'Undo',
    cancel: 'Cancel',
    close: 'Close',
    dismiss: 'Dismiss',
    retry: 'Try again',
    details: 'Details',
    hideDetails: 'Hide details',
    loadMore: 'Load more',
    saveAndExit: 'Save & exit',
    working: 'Working…',
  },
  ignite: {
    confidence: {
      certain: 'certain',
      confident: 'fairly sure',
      estimate: 'an estimate',
      guess: 'a guess for now',
    },
    approve: 'Approve',
    notNow: 'Not now',
    notEver: 'Not ever',
  },
} as const

export type DsMessages = typeof DS_MESSAGES
