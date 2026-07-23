<script setup lang="ts">
/**
 * /shops (Capability 02) — the directory: every live shop as a maker card, newest
 * first (honest recency, never ranking). The page a visitor uses to browse
 * MERCHANTS rather than moments.
 */
import { computed } from 'vue'
import { DofText, DofSkeleton, DofEmptyState } from '@ds/index'

definePageMeta({ layout: false })

interface Shop { handle: string; name: string; tagline: string | null; story: string | null; promise: string | null; followers: number; products_on_store: number; opened_at: string }

const origin = useRequestURL().origin
useHead({
  title: 'Shops on DOF',
  htmlAttrs: { 'data-scope': 'storefront' },
  link: [{ rel: 'canonical', href: `${origin}/shops` }],
})
useSeoMeta({
  description: 'Every independent shop on DOF — makers, bakers, roasters, coaches — newest first.',
  ogTitle: 'Shops on DOF',
  ogDescription: 'Every independent shop on DOF — makers, bakers, roasters, coaches — newest first.',
  ogType: 'website',
  ogUrl: `${origin}/shops`,
  twitterCard: 'summary',
})

const { data, pending } = await useFetch<{ items: Shop[] }>('/api/v1/public/shops')
const shops = computed(() => data.value?.items ?? [])
</script>

<template>
  <div class="min-h-dvh bg-surface font-ui text-foreground">
    <header class="border-b border-foreground/10">
      <div class="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4">
        <DofText role="title" as="h1">Shops on DOF</DofText>
        <nav aria-label="site" class="flex gap-4 text-caption text-foreground/80">
          <NuxtLink to="/home" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">Today</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
      <DofText role="body" tone="muted">Every shop here is a real person's work — newest doors first.</DofText>

      <div v-if="pending" class="grid gap-4 regular:grid-cols-2" aria-hidden="true">
        <DofSkeleton v-for="n in 4" :key="n" class="h-40 rounded-large" />
      </div>

      <ul v-else-if="shops.length > 0" class="grid list-none gap-4 p-0 regular:grid-cols-2">
        <li v-for="shop in shops" :key="shop.handle">
          <NuxtLink
            :to="`/s/${shop.handle}`"
            class="dof-interactive flex h-full flex-col gap-2 rounded-large border border-foreground/10 bg-foreground/[0.02] p-5 transition-colors hover:border-foreground/25 focus-visible:focus-ring"
          >
            <div class="flex items-baseline justify-between gap-2">
              <DofText role="title" as="h2" class="truncate">{{ shop.name }}</DofText>
              <DofText v-if="shop.followers > 0" role="caption" class="shrink-0 text-foreground/60">
                {{ shop.followers }} {{ shop.followers === 1 ? 'follower' : 'followers' }}
              </DofText>
            </div>
            <DofText v-if="shop.tagline" role="emphasis" as="p" class="text-foreground/90">{{ shop.tagline }}</DofText>
            <DofText v-if="shop.story" role="caption" class="line-clamp-2 text-foreground/70" reading>{{ shop.story }}</DofText>
            <div class="mt-auto flex items-center justify-between pt-2">
              <DofText v-if="shop.promise" role="caption" class="truncate text-positive">✓ {{ shop.promise }}</DofText>
              <DofText role="caption" class="shrink-0 text-foreground/60">
                {{ shop.products_on_store }} {{ shop.products_on_store === 1 ? 'thing' : 'things' }} on the shelf
              </DofText>
            </div>
          </NuxtLink>
        </li>
      </ul>

      <DofEmptyState v-else icon="store" title="The street is just opening" why="Shops appear here the moment they go live." heading-as="h2" />

      <NuxtLink to="/home" class="dof-interactive mx-auto rounded-small px-1 text-caption text-foreground/60 underline-offset-4 hover:underline focus-visible:focus-ring">
        ← Back to today's stream
      </NuxtLink>
    </main>

    <footer class="border-t border-foreground/10">
      <div class="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 text-caption text-foreground/60">
        <span>Independent shops, real people</span>
        <NuxtLink to="/home" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">powered by DOF</NuxtLink>
      </div>
    </footer>
  </div>
</template>
