<script setup lang="ts">
/**
 * DofTooltip — clarification, never essential content (tooltips are unreachable on
 * touch; anything required must live in the layout). Text-only by contract.
 */
import { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipPortal, TooltipContent } from 'reka-ui'

withDefaults(defineProps<{
  text: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}>(), { side: 'top' })
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          :side
          :side-offset="6"
          class="layer-overlay rounded-small bg-foreground px-2.5 py-1.5 font-ui text-caption text-surface shadow-overlay"
        >
          {{ text }}
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
