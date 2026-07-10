<script setup lang="ts">
/**
 * DofSpinner — the inline busy mark, ONLY for element-scoped work (a saving button,
 * an in-flight field). Surface-level waiting is useLoadingStage territory — a page
 * never opens with a spinner (Bible §6.3: <400ms show nothing).
 */
import type { Size } from '../types'
import { useDsMessages } from '../i18n'
import DofIcon from './dof-icon.vue'

withDefaults(defineProps<{
  size?: Size
  /** Spoken description of what's working; defaults to the generic working message. */
  label?: string
}>(), { size: 'md' })

const messages = useDsMessages()
</script>

<template>
  <span role="status" class="inline-flex items-center text-faint-foreground">
    <DofIcon name="loader-circle" :size class="animate-spin" />
    <span class="sr-only">{{ label ?? messages.common.working }}</span>
  </span>
</template>
