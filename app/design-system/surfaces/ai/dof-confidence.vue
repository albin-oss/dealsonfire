<script setup lang="ts">
/**
 * DofConfidence — calibrated language, never percentages (DESIGN-SYSTEM-001 DS-11).
 * The phrase set lives in the ignite i18n namespace so calibration is identical
 * platform-wide. Quiet dress: confidence is information, not decoration.
 */
import type { Confidence } from '../../patterns/composables/use-proposal'
import { useDsMessages } from '../../i18n'
import DofIcon from '../../primitives/dof-icon.vue'

const props = defineProps<{
  confidence: Confidence
}>()

const messages = useDsMessages()
const phrase = () => messages.ignite.confidence[props.confidence]
</script>

<template>
  <span class="inline-flex items-center gap-1 font-ui text-caption text-faint-foreground">
    <DofIcon name="sparkles" size="sm" class="size-3.5" />
    {{ phrase() }}
  </span>
</template>
