/**
 * useQueuedAction — offline is a state, not an error (UX-BIBLE §12; DESIGN-SYSTEM-001
 * §3.2 Offline). Actions run immediately when online; offline they queue, declare
 * themselves ("will send when you're back"), and flush on reconnect in order.
 * A failed flush re-queues at the head and surfaces the error — composed work is
 * never lost to a tunnel.
 */
import { ref, computed, readonly, watch } from 'vue'
import { useOnline } from '@vueuse/core'

export interface QueuedAction {
  id: number
  /** Merchant-language description: "Reply to Marta". */
  label: string
  run: () => Promise<void>
}

export function useQueuedAction(options: { onError?: (action: QueuedAction, error: unknown) => void } = {}) {
  const online = useOnline()
  const queue = ref<QueuedAction[]>([])
  const flushing = ref(false)
  let nextId = 1

  async function flush(): Promise<void> {
    if (flushing.value) return
    flushing.value = true
    try {
      while (online.value && queue.value.length > 0) {
        const action = queue.value[0]!
        try {
          await action.run()
          queue.value = queue.value.slice(1)
        } catch (error) {
          options.onError?.(action, error) // stays queued at the head; retry on next flush
          break
        }
      }
    } finally {
      flushing.value = false
    }
  }

  watch(online, (isOnline) => { if (isOnline) void flush() })

  /** Run now when online; queue with a visible declaration when not. */
  async function submit(label: string, run: () => Promise<void>): Promise<'ran' | 'queued'> {
    if (online.value && queue.value.length === 0) {
      await run()
      return 'ran'
    }
    queue.value = [...queue.value, { id: nextId++, label, run }]
    if (online.value) void flush()
    return 'queued'
  }

  return {
    online: readonly(online),
    queue: readonly(queue),
    pending: computed(() => queue.value.length),
    submit,
    flush,
  }
}
