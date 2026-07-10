<script setup lang="ts">
/**
 * DofSheet — the in-context side panel (the braid rule: objects open politely
 * without losing your place — UX-BIBLE §9). End-side at regular+, bottom sheet on
 * compact. Same single-interruption law as DofDialog; never stacks.
 */
import {
  DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogClose,
} from 'reka-ui'
import { useDsMessages } from '../i18n'
import DofIcon from './dof-icon.vue'

defineProps<{
  title: string
}>()

const open = defineModel<boolean>('open', { default: false })
const messages = useDsMessages()
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 layer-overlay bg-foreground/40" />
      <DialogContent
        class="fixed layer-overlay flex flex-col gap-3 overflow-y-auto border-line bg-surface-raised p-5 font-ui shadow-spotlight focus:outline-none
               inset-x-0 bottom-0 max-h-[85vh] rounded-t-large border-t
               regular:inset-y-0 regular:end-0 regular:start-auto regular:h-full regular:max-h-none regular:w-96 regular:rounded-none regular:border-t-0 regular:border-s"
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
        <slot :close="() => (open = false)" />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
