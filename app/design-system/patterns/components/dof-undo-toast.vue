<script setup lang="ts">
/**
 * DofUndoToast — the blessed rendering of useUndoable (DESIGN-SYSTEM-001 §3.2 Undo).
 * Undo is the PRIMARY affordance (UX-BIBLE §6.4: waiting states carry undo). Lives on
 * the toast layer; announces politely; reduced-motion renders without translation.
 */
import { TransitionGroup } from 'vue'
import type { UseUndoableReturn } from '../composables/use-undoable'
import { useDsMessages } from '../../i18n'
import { TRANSITIONS } from '../../motion'
import DofButton from '../../primitives/dof-button.vue'
import DofIcon from '../../primitives/dof-icon.vue'

defineProps<{
  undoable: Pick<UseUndoableReturn, 'entries' | 'undo'>
}>()

const messages = useDsMessages()
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-4 layer-toast flex flex-col items-center gap-2 px-4" role="status">
    <TransitionGroup v-bind="TRANSITIONS.rise">
      <div
        v-for="entry in undoable.entries.value"
        :key="entry.id"
        class="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-medium border border-line bg-surface-raised py-2 ps-4 pe-2 font-ui shadow-overlay"
      >
        <span class="flex min-w-0 items-center gap-2 text-body text-foreground">
          <DofIcon name="circle-check" size="sm" class="shrink-0 text-positive" />
          <span class="truncate">{{ entry.label }}</span>
        </span>
        <DofButton
          size="sm"
          variant="soft"
          tone="accent"
          icon="undo-2"
          :loading="entry.state === 'undoing'"
          @click="undoable.undo(entry.id)"
        >
          {{ messages.common.undo }}
        </DofButton>
      </div>
    </TransitionGroup>
  </div>
</template>
