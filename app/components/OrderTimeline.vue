<script setup lang="ts">
/**
 * OrderTimeline (UI contract R4.3) — the order's story, oldest → newest, each entry
 * a plain-language fact with its time. Positive tone is reserved for delivery and
 * completion (the one celebratory color — SM-4). Entry vocabulary follows the R3.4
 * status map; unknown entry types render their message honestly rather than hiding.
 */
import { DofText, DofIcon, DofTime, DofMoney } from '@ds/index'
import type { IconName } from '../design-system/icons/icons.generated'

interface Entry { entry_type: string; message: Record<string, unknown>; occurred_at: string }
defineProps<{ entries: Entry[]; storeName: string }>()

const ICON: Record<string, IconName> = {
  placed: 'check', payment: 'shield-check', confirmed: 'flame',
  packed: 'package', shipped: 'truck', delivered: 'party-popper', note: 'message-circle',
}
</script>

<template>
  <ol class="flex list-none flex-col gap-0 p-0" aria-label="order story">
    <li v-for="(entry, i) in entries" :key="i" class="relative flex gap-3 pb-5 last:pb-0">
      <div class="flex flex-col items-center">
        <span
          class="flex size-7 shrink-0 items-center justify-center rounded-full border"
          :class="entry.entry_type === 'delivered' || entry.entry_type === 'completed'
            ? 'border-positive/40 bg-positive/10 text-positive'
            : 'border-foreground/15 bg-foreground/[0.03] text-foreground/60'"
        >
          <DofIcon :name="ICON[entry.entry_type] ?? 'circle'" size="sm" />
        </span>
        <span v-if="i < entries.length - 1" class="w-px flex-1 bg-foreground/10" aria-hidden="true" />
      </div>
      <div class="flex min-w-0 flex-col gap-0.5 pt-1">
        <DofText role="body" class="text-foreground/90">
          <template v-if="entry.entry_type === 'placed'">
            {{ storeName }} has your order<template v-if="entry.message.total_minor">
              — <DofMoney :amount="Number(entry.message.total_minor)" :currency="String(entry.message.currency ?? 'EUR')" /></template>.
          </template>
          <template v-else-if="entry.entry_type === 'confirmed'">It’s really happening — your order is confirmed.</template>
          <template v-else-if="entry.entry_type === 'payment'">Payment settled.</template>
          <template v-else>{{ entry.message.text ?? entry.entry_type }}</template>
        </DofText>
        <DofText role="caption" class="text-foreground/50"><DofTime :value="entry.occurred_at" mode="relative" /></DofText>
      </div>
    </li>
  </ol>
</template>
