<script setup lang="ts">
/**
 * DofPopover — light contextual surface (filters, pickers, explain-panels).
 * One overlay layer, focus managed by reka-ui, Esc closes, focus returns.
 * Popovers never stack (UX-BIBLE §15: one interruption layer max).
 */
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent, PopoverClose } from 'reka-ui'
import { useDsMessages } from '../i18n'

withDefaults(defineProps<{
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
}>(), { side: 'bottom', align: 'center' })

const open = defineModel<boolean>('open', { default: false })
const messages = useDsMessages()
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <slot name="trigger" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        :side
        :align
        :side-offset="6"
        class="layer-overlay w-72 rounded-medium border border-line bg-surface-raised p-4 font-ui shadow-overlay focus-visible:focus-ring"
      >
        <slot :close="() => (open = false)" />
        <PopoverClose class="sr-only">{{ messages.common.close }}</PopoverClose>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
