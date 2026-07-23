<script setup lang="ts">
/**
 * PublishedBar (Increment 04) — the one just-published moment: message → View live →
 * Copy link → dismiss. Previously hand-rolled three times (products, deals, sparks).
 * The 0.2 law lives here: no dead ends, no success modals.
 */
import { DofText, DofButton } from '@ds/index'
import { useCopyFeedback } from '../composables/use-copy'

const props = defineProps<{
  /** The live public URL (cache-busted by the component). */
  liveUrl: string
}>()
const emit = defineEmits<{ dismiss: [] }>()

const { copiedId, copy } = useCopyFeedback()
const copyLink = () => copy('published', `${window.location.origin}${props.liveUrl}`)
const bustedUrl = () => `${props.liveUrl}?v=${Date.now()}`
</script>

<template>
  <section
    class="flex flex-wrap items-center gap-3 rounded-large border border-positive/40 bg-positive/5 p-4"
    aria-live="polite"
  >
    <DofText role="body" class="flex-1"><slot /></DofText>
    <NuxtLink :to="bustedUrl()" target="_blank" class="contents">
      <DofButton size="sm" tone="accent" icon="external-link">View live</DofButton>
    </NuxtLink>
    <DofButton size="sm" variant="soft" tone="neutral" icon="copy" @click="copyLink">
      {{ copiedId === 'published' ? 'Copied ✓' : 'Copy link' }}
    </DofButton>
    <DofButton size="sm" variant="ghost" tone="neutral" icon="x" aria-label="Dismiss" @click="emit('dismiss')" />
  </section>
</template>
