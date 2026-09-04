<script setup lang="ts">
/**
 * StoreHoldNotice (SV-3) — the honest word a held merchant was never told (Phase-2 gap).
 * It states only what the merchant needs: public selling is paused while the platform
 * reviews the store; existing orders, payouts, and returns are unaffected and should still
 * be fulfilled. It exposes NO abuse/risk internals, never implies money is frozen, and never
 * blocks the operational obligations on this page. Silent unless there is a hold.
 */
import { computed } from 'vue'
import { DofText } from '@ds/index'

const props = defineProps<{ hold: string | null | undefined }>()
const held = computed(() => props.hold === 'under_review' || props.hold === 'suspended')
</script>

<template>
  <section
    v-if="held"
    aria-label="store review notice"
    class="flex flex-col gap-1 rounded-large border border-caution/40 bg-caution/5 p-4"
  >
    <div class="flex items-center gap-2">
      <span class="size-2 rounded-full bg-caution" aria-hidden="true" />
      <DofText role="emphasis" as="h2">Your store is under review</DofText>
    </div>
    <DofText role="caption" tone="muted" reading>
      While our team reviews your store, it’s temporarily hidden from buyers and can’t take new
      orders. Your existing orders, payouts, and returns are unaffected — please keep fulfilling
      them here. We’ll email you if we need anything from you.
    </DofText>
  </section>
</template>
