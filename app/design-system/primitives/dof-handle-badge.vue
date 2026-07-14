<script setup lang="ts">
/**
 * DofHandleBadge — a store handle with its live availability (UX-IGNITE-002 §B3, the one
 * new permanent DS component). Shows `dof.dev/handle` plus a state the eye and the screen
 * reader both get (never color-only). When taken, offers pickable suggestions. Reused by
 * Ignite's Mirror today; Store Settings and marketplace handle changes tomorrow.
 */
import { computed } from 'vue'
import { useDsMessages } from '../i18n'
import type { IconName } from '../icons/icons.generated'
import DofIcon from './dof-icon.vue'
import DofChip from './dof-chip.vue'
import { cx } from '../utils/cx'

export type HandleBadgeState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

const props = withDefaults(defineProps<{
  handle: string
  state?: HandleBadgeState
  suggestions?: string[]
}>(), { state: 'idle', suggestions: () => [] })

const emit = defineEmits<{ pick: [handle: string] }>()

const messages = useDsMessages()
const STATE_UI = computed<Record<Exclude<HandleBadgeState, 'idle'>, { icon: IconName; classes: string; label: string }>>(() => ({
  checking: { icon: 'loader-circle', classes: 'text-muted-foreground', label: messages.handle.checking },
  available: { icon: 'check', classes: 'text-positive', label: messages.handle.available },
  taken: { icon: 'x', classes: 'text-critical', label: messages.handle.taken },
  invalid: { icon: 'x', classes: 'text-critical', label: messages.handle.invalid },
}))
const ui = computed(() => (props.state === 'idle' ? null : STATE_UI.value[props.state]))
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <p class="flex items-center gap-2 text-caption">
      <span class="font-medium text-muted-foreground">dof.dev/{{ handle }}</span>
      <span v-if="ui" :class="cx('flex items-center gap-1', ui.classes)" aria-live="polite">
        <DofIcon :name="ui.icon" size="sm" :class="state === 'checking' ? 'animate-spin' : undefined" />
        {{ ui.label }}
      </span>
    </p>
    <div v-if="state === 'taken' && suggestions.length > 0" class="flex flex-wrap gap-1.5" aria-label="available alternatives">
      <DofChip
        v-for="suggestion in suggestions"
        :key="suggestion"
        :label="suggestion"
        selectable
        @toggle="emit('pick', suggestion)"
      />
    </div>
  </div>
</template>
