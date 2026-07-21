<script setup lang="ts">
/**
 * PublicImg (Stream B, Batch 1) — an <img> that fails gracefully: a dead URL
 * renders a quiet branded placeholder instead of the browser's broken-image glyph
 * and stray alt text. Purely presentational; lazy by default.
 */
import { ref } from 'vue'

defineProps<{ src: string; alt: string; imgClass?: string }>()
const failed = ref(false)
</script>

<template>
  <div v-if="failed" :class="imgClass" class="flex items-center justify-center bg-accent/10" aria-hidden="true">
    <span class="text-caption text-foreground/40">·</span>
  </div>
  <img v-else :src="src" :alt="alt" :class="imgClass" loading="lazy" @error="failed = true">
</template>
