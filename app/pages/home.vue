<script setup lang="ts">
/**
 * /home — the living front page (Release 0.7). One chronological stream of commerce:
 * sparks (a store speaking), deals (a store offering), store debuts, maker stories, and noteworthy
 * new products — blended by recency. No ranking, no personalization; recency IS the
 * product. Following answers "what have the stores I care about done since I was
 * here?" — new-since-last-visit markers, a first-unread divider with jump-to, and a
 * badge on the Following filter. SSR, public. /discover 301s here.
 */
import { computed, ref } from 'vue'
import { DofText, DofMoney, DofChip, DofEmptyState, DofSkeleton } from '@ds/index'
import type { HomeFeedItem } from '../../server/utils/deals-feed'

definePageMeta({ layout: false })

const origin = useRequestURL().origin
useHead({
  title: 'Today on DOF',
  htmlAttrs: { 'data-scope': 'storefront' },
  link: [{ rel: 'canonical', href: `${origin}/home` }],
})
useSeoMeta({
  description: 'One living stream from independent stores — deals worth firing and updates worth reading.',
  ogTitle: 'Today on DOF',
  ogDescription: 'One living stream from independent stores — deals worth firing and updates worth reading.',
  ogType: 'website',
  ogUrl: `${origin}/home`,
  twitterCard: 'summary',
})

type Filter = 'all' | 'saved' | 'following'
const filter = ref<Filter>('all')
interface HomeResponse { items: HomeFeedItem[]; has_identity: boolean; last_visit: string | null; new_following_count: number }
const { data, pending } = await useFetch<HomeResponse>(
  () => `/api/v1/public/home?filter=${filter.value}`,
  { watch: [filter] },
)
const items = computed(() => data.value?.items ?? [])
const newCount = computed(() => data.value?.new_following_count ?? 0)

/** The first-unread divider sits before the first already-seen item (when new ones exist). */
const dividerIndex = computed(() => {
  const list = items.value
  if (!data.value?.last_visit || list.length === 0 || !list[0]?.is_new) return -1
  const idx = list.findIndex((item) => !item.is_new)
  return idx // -1 when everything is new (no divider needed)
})

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'following', label: 'Following' },
  { value: 'saved', label: 'Saved' },
]
const emptyCopy = computed(() =>
  filter.value === 'saved'
    ? { title: 'Nothing saved yet', why: 'Tap Save on any deal and it waits for you here.' }
    : filter.value === 'following'
      ? { title: 'You’re not following anyone yet', why: 'Follow a store and everything it does gathers here.' }
      : { title: 'Quiet right now', why: 'Stores publish deals and updates as they happen — check back soon.' })

const itemLink = (item: HomeFeedItem) =>
  item.type === 'deal'
    ? `/s/${item.store_handle}/d/${item.id}`
    : item.type === 'spark'
      ? `/s/${item.store_handle}/sparks/${item.id}`
      : item.type === 'product'
        ? `/s/${item.store_handle}/p/${item.product_id}`
        : `/s/${item.store_handle}`

/** Jump to where you left off — the caught-up divider. */
function jumpToUnread() {
  document.getElementById('caught-up')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
</script>

<template>
  <div class="min-h-dvh bg-surface font-ui text-foreground">
    <header class="border-b border-foreground/10">
      <div class="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-4">
        <DofText role="title" as="h1">Today on DOF</DofText>
        <DofText role="caption" class="text-foreground/60">DOF</DofText>
      </div>
    </header>

    <main class="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div class="flex gap-2" role="group" aria-label="filter the stream">
        <DofChip
          v-for="f in FILTERS" :key="f.value"
          :label="f.value === 'following' && newCount > 0 ? `${f.label} · ${newCount} new` : f.label"
          :selected="filter === f.value"
          @click="filter = f.value"
        />
      </div>

      <button
        v-if="dividerIndex > 0"
        type="button"
        class="dof-interactive flex items-center justify-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-caption text-accent focus-visible:focus-ring"
        @click="jumpToUnread"
      >
        {{ dividerIndex }} new since your last visit — jump to where you left off ↓
      </button>

      <div v-if="pending" class="flex flex-col gap-4" aria-hidden="true">
        <DofSkeleton v-for="n in 3" :key="n" class="h-40 rounded-large" />
      </div>

      <ul v-else-if="items.length > 0" class="flex list-none flex-col gap-4 p-0">
        <template v-for="(item, index) in items" :key="`${item.type}-${item.id}`">
          <!-- the first-unread divider: everything below, you've already seen -->
          <li v-if="index === dividerIndex" id="caught-up" aria-hidden="true" class="flex items-center gap-3 py-1">
            <span class="h-px flex-1 bg-foreground/15" />
            <DofText role="caption" class="text-foreground/50">You’re caught up</DofText>
            <span class="h-px flex-1 bg-foreground/15" />
          </li>

          <li class="flex flex-col gap-3 rounded-large border border-foreground/10 bg-foreground/[0.02] p-4">
            <div class="flex items-baseline justify-between gap-2">
              <NuxtLink :to="`/s/${item.store_handle}`" class="dof-interactive rounded-small text-caption font-medium text-foreground/70 hover:text-foreground focus-visible:focus-ring">
                {{ item.store_name }}
              </NuxtLink>
              <DofText v-if="item.is_new" role="caption" class="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-accent">New</DofText>
            </div>

            <!-- a deal: the offer leads -->
            <NuxtLink v-if="item.type === 'deal'" :to="itemLink(item)" class="dof-interactive flex flex-col gap-2 rounded-medium focus-visible:focus-ring">
              <DofText role="title" as="h2">{{ item.text }}</DofText>
              <img
                v-if="item.image_url"
                :src="item.image_url"
                :alt="item.image_alt ?? item.product_title ?? ''"
                class="h-48 w-full rounded-medium object-cover"
                loading="lazy"
              >
              <div class="flex items-baseline justify-between gap-2">
                <DofText role="body" class="truncate text-foreground/80">{{ item.product_title }}</DofText>
                <DofMoney v-if="item.price_minor !== null" :amount="item.price_minor" :currency="item.currency ?? 'EUR'" class="shrink-0 font-medium" />
              </div>
            </NuxtLink>

            <!-- a store debut: a new door on the street -->
            <NuxtLink v-else-if="item.type === 'store'" :to="itemLink(item)" class="dof-interactive flex flex-col gap-1 rounded-medium focus-visible:focus-ring">
              <DofText role="caption" class="uppercase tracking-widest text-accent">New on DOF</DofText>
              <DofText role="title" as="h2">{{ item.text }} just opened its doors</DofText>
              <DofText v-if="item.story" role="body" class="text-foreground/80">{{ item.story }}</DofText>
            </NuxtLink>

            <!-- meet the maker: the person behind the store (Release 0.9) -->
            <NuxtLink v-else-if="item.type === 'maker'" :to="itemLink(item)" class="dof-interactive flex flex-col gap-2 rounded-medium focus-visible:focus-ring">
              <DofText role="caption" class="uppercase tracking-widest text-accent">Meet the maker</DofText>
              <DofText role="title" as="h2">{{ item.text }}</DofText>
              <DofText v-if="item.story" role="body" class="line-clamp-4 text-foreground/90" reading>{{ item.story }}</DofText>
              <DofText v-if="item.promise" role="caption" class="text-positive">✓ {{ item.promise }}</DofText>
              <DofText role="caption" class="text-foreground/60">Read their story →</DofText>
            </NuxtLink>

            <!-- a noteworthy new product: something new on a shelf -->
            <NuxtLink v-else-if="item.type === 'product'" :to="itemLink(item)" class="dof-interactive flex flex-col gap-2 rounded-medium focus-visible:focus-ring">
              <DofText role="caption" class="uppercase tracking-widest text-accent">New in {{ item.store_name }}</DofText>
              <DofText role="title" as="h2">{{ item.text }}</DofText>
              <img
                v-if="item.image_url"
                :src="item.image_url"
                :alt="item.image_alt ?? item.text"
                class="h-48 w-full rounded-medium object-cover"
                loading="lazy"
              >
              <div class="flex items-baseline justify-end">
                <DofMoney v-if="item.price_minor !== null" :amount="item.price_minor" :currency="item.currency ?? 'EUR'" class="shrink-0 font-medium" />
              </div>
            </NuxtLink>

            <!-- a spark: the words lead -->
            <NuxtLink v-else :to="itemLink(item)" class="dof-interactive flex flex-col gap-2 rounded-medium focus-visible:focus-ring">
              <DofText role="body" class="line-clamp-4 whitespace-pre-line text-foreground/95" reading>{{ item.text }}</DofText>
              <img
                v-if="item.image_url"
                :src="item.image_url"
                :alt="`photo from ${item.store_name}`"
                class="max-h-64 w-full rounded-medium object-cover"
                loading="lazy"
              >
            </NuxtLink>

            <DealEngage
              :kind="item.type === 'deal' || item.type === 'spark' ? item.type : 'store'"
              :deal-id="item.id"
              :store-handle="item.store_handle"
              :store-name="item.store_name"
              :fires="item.fires"
              :reacted="item.viewer_reacted"
              :saved="item.viewer_saved"
              :follows="item.viewer_follows"
              variant="compact"
            />
          </li>
        </template>
      </ul>

      <DofEmptyState v-else icon="flame" :title="emptyCopy.title" :why="emptyCopy.why" />
    </main>

    <footer class="border-t border-foreground/10">
      <div class="mx-auto flex max-w-2xl items-center justify-between px-4 py-4 text-caption text-foreground/60">
        <span>Deals and updates from independent stores</span>
        <span>powered by DOF</span>
      </div>
    </footer>
  </div>
</template>
