/**
 * Announcer — screen-reader narration as narrative (DESIGN-SYSTEM-001 §11; UX-BIBLE
 * §13). One pair of live regions per app (DofAnnouncer renders them); everything
 * announces through this store. Polite by default; assertive is reserved for money
 * and problems — the same restraint law as notifications.
 */
import { ref, readonly } from 'vue'

const politeMessage = ref('')
const assertiveMessage = ref('')

export function announce(message: string, options: { assertive?: boolean } = {}): void {
  const target = options.assertive ? assertiveMessage : politeMessage
  // clear-then-set so repeating the same sentence re-announces
  target.value = ''
  setTimeout(() => { target.value = message }, 30)
}

export function useAnnouncer() {
  return {
    announce,
    politeMessage: readonly(politeMessage),
    assertiveMessage: readonly(assertiveMessage),
  }
}
