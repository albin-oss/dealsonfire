<script setup lang="ts">
/** DofAnnouncer — the app's single pair of live regions. Mount once in the root layout. */
import { useAnnouncer } from '../../a11y/announcer'

const { politeMessage, assertiveMessage } = useAnnouncer()
</script>

<template>
  <div class="sr-only" aria-live="polite" role="status">{{ politeMessage }}</div>
  <div class="sr-only" aria-live="assertive" role="alert">{{ assertiveMessage }}</div>
</template>
