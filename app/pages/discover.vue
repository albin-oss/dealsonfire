<script setup lang="ts">
/**
 * /discover (Release 0.4) — the first network surface: every live deal from every live
 * store, honest recency, no ranking. The return loops live here: Saved (the visitor's
 * shelf) and Following (their merchants). Public, SSR, mobile-first. Every card leads
 * somewhere: the deal, the store, or another deal.
 */
import { computed, ref } from 'vue'
import { DofText, DofMoney, DofChip, DofEmptyState, DofSkeleton } from '@ds/index'
import type { FeedDeal } from '../../server/utils/deals-feed'

definePageMeta({ layout: false })

const origin = useRequestURL().origin
useHead({
  title: 'Today’s deals — DOF',
  htmlAttrs: { 'data-scope': 'storefront' },
  link: [{ rel: 'canonical', href: `${origin}/discover` }],
})
useSeoMeta({
  description: 'Deals from independent stores — fresh, honest, and worth sharing.',
  ogTitle: 'Today’s deals — DOF',
  ogDescription: 'Deals from independent stores — fresh, honest, and worth sharing.',
  ogType: 'website',
  ogUrl: `${origin}/discover`,
  twitterCard: 'summary',
})

type Filter = 'all' | 'saved' | 'following'
const filter = ref<Filter>('all')
const { data, pending } = await useFetch<{ items: FeedDeal[]; has_identity: boolean }>(
  () => `/api/v1/public/deals?filter=${filter.value}`,
  { watch: [filter] },
)
const items = computed(() => data.value?.items ?? [])

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All deals' },
  { value: 'saved', label: 'Saved' },
  { value: 'following', label: 'Following' },
]
const emptyCopy = computed(() =>
  filter.value === 'saved'
    ? { title: 'Nothing saved yet', why: 'Tap Save on any deal and it waits for you here.' }
    : filter.value === 'following'
      ? { title: 'You’re not following anyone yet', why: 'Follow a store and its deals gather here.' }
      : { title: 'No deals right now', why: 'Merchants publish deals as they happen — check back soon.' })
</script>

<template>
  <div class="min-h-dvh bg-surface font-ui text-foreground">
    <header class="border-b border-foreground/10">
      <div class="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-4">
        <DofText role="title" as="h1">Today’s deals</DofText>
        <DofText role="caption" class="text-foreground/60">DOF</DofText>
      </div>
    </header>

    <main class="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div class="flex gap-2" role="group" aria-label="filter deals">
        <DofChip
          v-for="f in FILTERS" :key="f.value"
          :label="f.label"
          :selected="filter === f.value"
          @click="filter = f.value"
        />
      </div>

      <div v-if="pending" class="flex flex-col gap-4" aria-hidden="true">
        <DofSkeleton v-for="n in 3" :key="n" class="h-48 rounded-large" />
      </div>

      <ul v-else-if="items.length > 0" class="flex list-none flex-col gap-4 p-0">
        <li v-for="deal in items" :key="deal.id" class="flex flex-col gap-3 rounded-large border border-foreground/10 bg-foreground/[0.02] p-4">
          <div class="flex items-baseline justify-between gap-2">
            <NuxtLink :to="`/s/${deal.store_handle}`" class="dof-interactive rounded-small text-caption font-medium text-foreground/70 hover:text-foreground focus-visible:focus-ring">
              {{ deal.store_name }}
            </NuxtLink>
          </div>
          <NuxtLink :to="`/s/${deal.store_handle}/d/${deal.id}`" class="dof-interactive flex flex-col gap-2 rounded-medium focus-visible:focus-ring">
            <DofText role="title" as="h2">{{ deal.headline }}</DofText>
            <img
              v-if="deal.image_url"
              :src="deal.image_url"
              :alt="deal.image_alt ?? deal.product_title"
              class="h-48 w-full rounded-medium object-cover"
              loading="lazy"
            >
            <div class="flex items-baseline justify-between gap-2">
              <DofText role="body" class="truncate text-foreground/80">{{ deal.product_title }}</DofText>
              <DofMoney v-if="deal.price_minor !== null" :amount="deal.price_minor" :currency="deal.currency ?? 'EUR'" class="shrink-0 font-medium" />
            </div>
          </NuxtLink>
          <DealEngage
            :deal-id="deal.id"
            :store-handle="deal.store_handle"
            :store-name="deal.store_name"
            :fires="deal.fires"
            :reacted="deal.viewer_reacted"
            :saved="deal.viewer_saved"
            :follows="deal.viewer_follows"
            variant="compact"
          />
        </li>
      </ul>

      <DofEmptyState v-else icon="flame" :title="emptyCopy.title" :why="emptyCopy.why" />
    </main>

    <footer class="border-t border-foreground/10">
      <div class="mx-auto flex max-w-2xl items-center justify-between px-4 py-4 text-caption text-foreground/60">
        <span>Deals from independent stores</span>
        <span>powered by DOF</span>
      </div>
    </footer>
  </div>
</template>
