<script setup lang="ts">
/**
 * DofToastRegion — renders the notice pipeline (mount once, toast layer). Quiet by
 * design: no pulsing, no badges; a deadline (real ones only — the API enforces it)
 * earns the caution mark. Undo toasts live in DofUndoToast; this region carries
 * everything else. role=status announces politely.
 */
import { computed, TransitionGroup } from 'vue'
import { useNotices } from '../composables/use-notices'
import { useDsMessages } from '../../i18n'
import { TRANSITIONS } from '../../motion'
import { cx } from '../../utils/cx'
import DofIcon from '../../primitives/dof-icon.vue'
import DofTime from '../../primitives/dof-time.vue'
import type { Tone } from '../../types'

const { notices, dismiss } = useNotices()
const messages = useDsMessages()
const visible = computed(() => notices.value.slice(0, 3))

const TONE_ICON: Partial<Record<Tone, 'circle-check' | 'circle-alert' | 'info' | 'flame'>> = {
  positive: 'circle-check',
  critical: 'circle-alert',
  caution: 'circle-alert',
  info: 'info',
  ember: 'flame',
}
const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-muted-foreground',
  accent: 'text-accent',
  positive: 'text-positive',
  caution: 'text-caution',
  critical: 'text-critical',
  info: 'text-info',
  ember: 'text-ember',
}
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 top-4 layer-toast flex flex-col items-center gap-2 px-4" role="status" aria-label="notifications">
    <TransitionGroup v-bind="TRANSITIONS.rise">
      <div
        v-for="notice in visible"
        :key="notice.id"
        class="pointer-events-auto flex w-full max-w-md items-start justify-between gap-3 rounded-medium border border-line bg-surface-raised p-3 font-ui shadow-overlay"
      >
        <div class="flex min-w-0 items-start gap-2.5">
          <DofIcon v-if="TONE_ICON[notice.tone]" :name="TONE_ICON[notice.tone]!" size="sm" :class="cx('mt-0.5 shrink-0', TONE_TEXT[notice.tone])" />
          <div class="flex min-w-0 flex-col gap-0.5">
            <span class="text-body text-foreground">{{ notice.title }}</span>
            <span v-if="notice.body" class="text-caption text-muted-foreground">{{ notice.body }}</span>
            <span v-if="notice.deadline" class="text-caption text-caution">
              <DofTime :value="notice.deadline" mode="relative" />
            </span>
          </div>
        </div>
        <button
          type="button"
          class="dof-interactive -me-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-small text-faint-foreground hover:bg-surface-sunken focus-visible:focus-ring"
          :aria-label="messages.common.dismiss"
          @click="dismiss(notice.id)"
        >
          <DofIcon name="x" size="sm" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
