/**
 * useNotices — the consolidated notice pipeline (DESIGN-SYSTEM-001 §3.2 Notifications;
 * UX-BIBLE §1.3 Calm). One queue for the whole app, rendered by DofToastRegion.
 * Calm is API-shaped: an urgency treatment REQUIRES a real deadline; without one the
 * notice renders quiet and auto-settles. Max three visible — the rest wait their turn.
 */
import { ref, readonly } from 'vue'
import type { Tone } from '../../types'

export interface Notice {
  id: number
  title: string
  /** Optional supporting sentence (merchant language, complete sentence). */
  body?: string
  tone: Tone
  /** A REAL deadline is the only path to urgent treatment (no anxiety farming). */
  deadline?: Date
  /** Sticky notices need explicit dismissal (money and problems only, by convention). */
  sticky: boolean
  expiresAt: number | null
}

const MAX_VISIBLE = 3
const SETTLE_MS = 6000

const queue = ref<Notice[]>([])
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let nextId = 1

function scheduleSettle(notice: Notice) {
  if (notice.sticky || notice.expiresAt === null) return
  timers.set(notice.id, setTimeout(() => dismiss(notice.id), Math.max(0, notice.expiresAt - Date.now())))
}

export function notify(input: { title: string; body?: string; tone?: Tone; deadline?: Date; sticky?: boolean }): number {
  const sticky = input.sticky ?? false
  const notice: Notice = {
    id: nextId++,
    title: input.title,
    body: input.body,
    tone: input.tone ?? 'neutral',
    deadline: input.deadline,
    sticky,
    expiresAt: sticky ? null : Date.now() + SETTLE_MS,
  }
  queue.value = [...queue.value, notice]
  scheduleSettle(notice)
  return notice.id
}

export function dismiss(id: number): void {
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  timers.delete(id)
  queue.value = queue.value.filter((n) => n.id !== id)
}

export function useNotices() {
  return {
    notices: readonly(queue),
    visible: () => queue.value.slice(0, MAX_VISIBLE),
    notify,
    dismiss,
  }
}
