<script setup lang="ts">
/**
 * /orders/:orderId (Commerce Foundation C3) — the letter, not a receipt (SM-3):
 * what happens next, in whose hands, then the story so far. Composed like
 * correspondence — the one place in commerce where slowing down is right.
 * Buyer-gated by the visitor identity; someone else's order is a 404.
 */
import { computed } from 'vue'
import { DofText, DofMoney, DofButton, DofSkeleton, DofTime } from '@ds/index'
import type { BuyerOrderResponse } from '@contracts/schemas/orders/checkout.schema'

definePageMeta({ layout: false })
useHead({ title: 'Your order — DOF', htmlAttrs: { 'data-scope': 'marketplace' } })

const route = useRoute()
const orderId = computed(() => String(route.params.orderId ?? ''))
const justPlaced = computed(() => route.query.welcome === '1')

const { data, pending, error } = await useFetch<BuyerOrderResponse>(
  () => `/api/v1/public/orders/${encodeURIComponent(orderId.value)}`,
  { lazy: true, server: false },
)
const order = computed(() => data.value?.order ?? null)
const lines = computed(() => data.value?.lines ?? [])
const timeline = computed(() => data.value?.timeline ?? [])

// R3.4 — the one status vocabulary, dot + words
const STATUS: Record<string, { label: string; positive?: boolean }> = {
  placed: { label: 'Order placed' },
  payment_pending: { label: 'Payment settling' },
  payment_failed: { label: 'Payment needs another try' },
  confirmed: { label: 'Confirmed — being made ready' },
  in_fulfillment: { label: 'Getting ready' },
  partially_fulfilled: { label: 'Partly on its way' },
  fulfilled: { label: 'On its way' },
  completed: { label: 'Delivered', positive: true },
  cancelled: { label: 'Cancelled' },
}
const status = computed(() => STATUS[order.value?.state ?? ''] ?? { label: order.value?.state ?? '' })
</script>

<template>
  <div class="min-h-dvh bg-surface font-ui text-foreground">
    <header class="border-b border-foreground/10">
      <div class="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-4">
        <DofText role="title" as="h1">Your order</DofText>
        <nav aria-label="site" class="flex gap-4 text-caption text-foreground/80">
          <NuxtLink to="/o" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">All orders</NuxtLink>
          <NuxtLink to="/home" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">Today</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10">
      <div v-if="pending && !order" class="flex flex-col gap-3" aria-hidden="true">
        <DofSkeleton v-for="n in 3" :key="n" class="h-24 rounded-large" />
      </div>

      <template v-else-if="order">
        <!-- ——— the letter (reading rhythm, generous space) -->
        <section aria-label="the letter" class="flex flex-col gap-4">
          <DofText v-if="justPlaced" role="headline" as="p" reading>It’s on its way to being yours.</DofText>
          <div class="flex items-center gap-2">
            <span class="inline-block size-2 rounded-full" :class="status.positive ? 'bg-positive' : 'bg-accent'" aria-hidden="true" />
            <DofText role="emphasis" as="p">{{ status.label }}</DofText>
          </div>
          <DofText role="body" class="max-w-prose text-foreground/90" reading>
            <NuxtLink :to="`/s/${order.store_handle}`" class="dof-interactive rounded-small font-medium underline-offset-4 hover:underline focus-visible:focus-ring">{{ order.store_name }}</NuxtLink>
            has your order — we’ll tell you the moment it’s confirmed and again when it ships.
            Everything below stays right here, on any device.
          </DofText>
        </section>

        <!-- ——— the story so far -->
        <section aria-label="story" class="flex flex-col gap-3">
          <OrderTimeline :entries="timeline" :store-name="order.store_name" />
        </section>

        <!-- ——— the things -->
        <section aria-label="what you ordered" class="flex flex-col gap-3 rounded-large border border-foreground/10 bg-foreground/[0.02] p-4">
          <ul class="flex list-none flex-col gap-3 p-0">
            <li v-for="line in lines" :key="line.line_no" class="flex items-center gap-3">
              <NuxtLink :to="`/s/${order.store_handle}/p/${line.product_id}`" class="dof-interactive shrink-0 rounded-medium focus-visible:focus-ring">
                <PublicImg v-if="line.image_url" :src="line.image_url" :alt="line.title" img-class="size-14 rounded-medium object-cover" />
                <div v-else class="flex size-14 items-center justify-center rounded-medium bg-accent/10 text-caption text-foreground/50" aria-hidden="true">·</div>
              </NuxtLink>
              <div class="flex min-w-0 flex-1 flex-col">
                <DofText role="body" class="truncate font-medium">{{ line.title }}</DofText>
                <DofText role="caption" tone="muted">{{ line.option_label ? `${line.option_label} · ` : '' }}{{ line.quantity }}×</DofText>
              </div>
              <DofMoney :amount="line.unit_price_minor * line.quantity" :currency="order.currency" class="shrink-0" />
            </li>
          </ul>
          <div class="flex items-baseline justify-between border-t border-foreground/10 pt-3">
            <DofText role="body" class="font-medium">Total</DofText>
            <DofMoney :amount="order.total_minor" :currency="order.currency" class="font-semibold" />
          </div>
        </section>

        <!-- ——— where it's going (two calm lines — R3.7) -->
        <section aria-label="delivery" class="flex flex-col gap-1">
          <DofText role="caption" tone="muted">Going to</DofText>
          <DofText role="body">{{ order.contact_name }} · {{ order.delivery.line1 }}</DofText>
          <DofText role="body" tone="muted">{{ order.delivery.postal_code }} {{ order.delivery.city }}, {{ order.delivery.country }}</DofText>
          <DofText role="caption" class="mt-1 text-foreground/50">Order {{ order.order_number }} · placed <DofTime :value="order.placed_at" mode="relative" /></DofText>
        </section>

        <!-- ——— the door (R1.5) -->
        <NuxtLink :to="`/s/${order.store_handle}`" class="dof-interactive mx-auto rounded-small px-1 text-caption text-foreground/60 underline-offset-4 hover:underline focus-visible:focus-ring">
          More from {{ order.store_name }} →
        </NuxtLink>
      </template>

      <div v-else-if="error" class="flex flex-col items-center gap-3 py-12">
        <DofText role="body" tone="muted">This order doesn’t exist — or it belongs to a different device.</DofText>
        <NuxtLink to="/home" class="contents"><DofButton variant="soft" tone="neutral">Back to the street</DofButton></NuxtLink>
      </div>
    </main>
  </div>
</template>
