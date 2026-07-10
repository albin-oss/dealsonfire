<script setup lang="ts">
/**
 * DofRunShell — full-screen flow state (DESIGN-SYSTEM-001 §5; UX-BIBLE §5.3): chrome
 * gone, one clearly-marked exit that always preserves progress, focus trapped while
 * open, Esc leaves. Runs are sacred: nothing may layer above (ceremony layer excepted,
 * and ceremonies queue behind runs by contract).
 */
import { ref, toRef, computed } from 'vue'
import { useFocusTrap } from '../a11y/use-focus-trap'
import { useDsMessages } from '../i18n'
import DofButton from '../primitives/dof-button.vue'
import DofText from '../primitives/dof-text.vue'

const props = defineProps<{
  open: boolean
  /** The run's name: "Packing 6 orders". */
  title: string
  /** Progress in words, not percentages: "4 of 6 packed". */
  progress?: string
  exitLabel?: string
}>()

const messages = useDsMessages()
const exitText = computed(() => props.exitLabel ?? messages.common.saveAndExit)

const emit = defineEmits<{ exit: [] }>()

const container = ref<HTMLElement | null>(null)
useFocusTrap(container, toRef(props, 'open'))

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('exit')
}
</script>

<template>
  <div
    v-if="open"
    ref="container"
    class="fixed inset-0 layer-ceremony flex flex-col bg-surface"
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    tabindex="-1"
    @keydown="onKeydown"
  >
    <header class="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <div class="flex min-w-0 items-baseline gap-3">
        <DofText role="emphasis" as="h1">{{ title }}</DofText>
        <DofText v-if="progress" role="caption" tone="muted" as="span">{{ progress }}</DofText>
      </div>
      <DofButton size="sm" variant="ghost" tone="neutral" icon="x" @click="emit('exit')">{{ exitText }}</DofButton>
    </header>
    <main class="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      <slot />
    </main>
    <footer v-if="$slots.footer" class="border-t border-line px-4 py-3">
      <slot name="footer" />
    </footer>
  </div>
</template>
