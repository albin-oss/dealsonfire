/**
 * useShare (Increment 12) — THE share idiom for public pages. One behavior
 * everywhere: the native sheet where it exists, otherwise copy the link and
 * say so for two seconds. Four pages hand-rolled this identically; now the
 * street shares one voice.
 */
import { ref } from 'vue'
import { announce } from '@ds/index'

export function useShare() {
  const sharedId = ref<string | null>(null)

  async function share(id: string, payload: { title: string; text: string; url: string }) {
    try {
      if (navigator.share) {
        await navigator.share(payload)
      } else {
        await navigator.clipboard.writeText(payload.url)
        sharedId.value = id
        setTimeout(() => (sharedId.value = null), 2000)
      }
      announce('Link ready to share.')
    } catch { /* user dismissed the sheet — nothing to do */ }
  }

  return { sharedId, share }
}
