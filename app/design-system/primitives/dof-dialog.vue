<script setup lang="ts">
/**
 * DofDialog — the ONE interruption layer (UX-BIBLE §15: no modal stacks), reserved
 * for genuine R2/R3 consequence (DESIGN-SYSTEM-001 §3.2 Confirmation). Reka Dialog
 * underneath: focus trapped, Esc closes, focus restored, scroll locked. The title
 * is required — an unlabeled interruption is a defect.
 */
import {
  DialogRoot, DialogPortal, DialogOverlay, DialogContent,
  DialogTitle, DialogDescription, DialogClose,
} from 'reka-ui'
import { useDsMessages } from '../i18n'
import { cx } from '../utils/cx'
import DofIcon from './dof-icon.vue'

const props = withDefaults(defineProps<{
  title: string
  description?: string
  /** Danger dress for R3 confirmations. */
  tone?: 'neutral' | 'critical'
}>(), { tone: 'neutral' })

const open = defineModel<boolean>('open', { default: false })
const messages = useDsMessages()
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 layer-overlay bg-foreground/40" />
      <DialogContent
        class="fixed inset-x-4 top-1/2 layer-overlay mx-auto flex max-h-[85vh] w-auto max-w-lg -translate-y-1/2 flex-col gap-3 overflow-y-auto rounded-large border bg-surface-raised p-5 font-ui shadow-spotlight focus:outline-none"
        :class="cx(props.tone === 'critical' ? 'border-critical/30' : 'border-line')"
      >
        <div class="flex items-start justify-between gap-3">
          <DialogTitle class="text-title font-semibold text-foreground">{{ title }}</DialogTitle>
          <DialogClose
            class="dof-interactive -me-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-small text-muted-foreground hover:bg-surface-sunken focus-visible:focus-ring"
            :aria-label="messages.common.close"
          >
            <DofIcon name="x" size="sm" />
          </DialogClose>
        </div>
        <DialogDescription v-if="description" class="text-body text-muted-foreground">
          {{ description }}
        </DialogDescription>
        <slot :close="() => (open = false)" />
        <div v-if="$slots.footer" class="flex items-center justify-end gap-2 pt-1">
          <slot name="footer" :close="() => (open = false)" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
