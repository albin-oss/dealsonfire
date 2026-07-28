<script setup lang="ts">
/**
 * /orders (C3) — the buyer's shelf of orders, newest first. Visitor-scoped;
 * empty is honest. Grows into the shelf of stories as timelines fill (SX-2).
 */
import { computed } from 'vue'
import { DofText, DofMoney, DofTime, DofSkeleton, DofEmptyState, DofButton } from '@ds/index'
import type { BuyerOrdersResponse } from '@contracts/schemas/orders/checkout.schema'

definePageMeta({ layout: false })
useHead({ title: 'Your orders — DOF', htmlAttrs: { 'data-scope': 'marketplace' } })

const { data, pending } = await useFetch<BuyerOrdersResponse>('/api/v1/public/orders', { lazy: true, server: false })
const items = computed(() => data.value?.items ?? [])
</script>

<template>
  <div class="min-h-dvh bg-surface font-ui text-foreground">
    <header class="border-b border-foreground/10">
      <div class="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
        <DofText role="title" as="h1">Your orders</DofText>
        <nav aria-label="site" class="flex gap-4 text-caption text-foreground/80">
          <NuxtLink to="/cart" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">Cart</NuxtLink>
          <NuxtLink to="/home" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">Today</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <div v-if="pending && items.length === 0" class="flex flex-col gap-3" aria-hidden="true">
        <DofSkeleton v-for="n in 2" :key="n" class="h-20 rounded-large" />
      </div>

      <ul v-else-if="items.length > 0" class="flex list-none flex-col gap-3 p-0">
        <li v-for="item in items" :key="item.id">
          <NuxtLink
            :to="`/o/${item.id}`"
            class="dof-interactive flex items-center justify-between gap-3 rounded-large border border-foreground/10 bg-foreground/[0.02] p-4 transition-colors hover:border-foreground/25 focus-visible:focus-ring"
          >
            <div class="flex min-w-0 flex-col gap-0.5">
              <DofText role="body" class="font-medium">{{ item.store_name }}</DofText>
              <DofText role="caption" tone="muted">
                {{ item.line_count }} {{ item.line_count === 1 ? 'thing' : 'things' }} · placed <DofTime :value="item.placed_at" mode="relative" />
              </DofText>
            </div>
            <DofMoney :amount="item.total_minor" :currency="item.currency" class="shrink-0 font-medium" />
          </NuxtLink>
        </li>
      </ul>

      <DofEmptyState
        v-else-if="!pending"
        icon="package"
        title="No orders yet"
        why="When you buy from a maker on the street, the whole story lands here — and stays."
        heading-as="h2"
      >
        <NuxtLink to="/home" class="contents"><DofButton tone="accent">See what’s on the street today</DofButton></NuxtLink>
      </DofEmptyState>
    </main>
  </div>
</template>
