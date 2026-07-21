/**
 * Copy-link feedback (Stream B, Batch 1). Every "Copy link" in the product used to
 * confirm only via the SR live region — sighted users got nothing. One idiom now:
 * the pressed button's label swaps to "Copied ✓" for two seconds, everywhere.
 */
import { ref } from 'vue'
import { announce } from '@ds/index'

export function useCopyFeedback() {
  const copiedId = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  async function copy(id: string, url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url)
      copiedId.value = id
      announce('Link copied — send it to someone.')
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => (copiedId.value = null), 2000)
    } catch {
      announce(url) // clipboard blocked — surface the URL itself
    }
  }
  return { copiedId, copy }
}
