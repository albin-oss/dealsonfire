<script setup lang="ts">
/**
 * /street/:lane (LS-3) — one door into shared geography.
 *
 * A lane is not a ranking and not personalization: the header says exactly
 * why things are here (the honest inclusion sentence), contents run newest
 * first, and "search within this idea" hands the lane's words to /search —
 * lanes and search are one discovery system. Empty lanes tell the truth.
 */
import { computed } from 'vue'
import { DofText, DofMoney, DofSkeleton } from '@ds/index'
import { recordLaneView, recordLaneClick } from '../../composables/attention'
import { laneCanonical, laneMeta } from '../../composables/public-seo'

interface ShopHit { id: string; handle: string; name: string; tagline: string | null; excerpt: string | null }
interface ProductHit { id: string; title: string; price_minor: number | null; currency: string | null; store_handle: string; store_name: string; image_url: string | null; excerpt: string | null }
interface DealHit { id: string; headline: string; store_handle: string; store_name: string; excerpt: string | null }
interface SparkHit { id: string; excerpt: string; store_handle: string; store_name: string }
interface LanePayload {
  lane: { id: string; title: string; blurb: string; inclusion: string; kind: 'search' | 'rule'; q: string | null }
  shops: ShopHit[]; products: ProductHit[]; deals: DealHit[]; sparks: SparkHit[]
  totals: { shops: number; products: number; deals: number; sparks: number }
}

const route = useRoute()
const laneId = computed(() => String(route.params.lane ?? ''))
const { data, pending, error } = await useFetch<LanePayload>(() => `/api/v1/public/lanes/${laneId.value}`)
if (error.value) throw createError({ statusCode: 404, statusMessage: 'This lane does not exist', fatal: true })

const origin = useRequestURL().origin
const laneTotal = computed(() => data.value
  ? data.value.totals.shops + data.value.totals.products + data.value.totals.deals + data.value.totals.sparks
  : 0)
useHead(() => ({
  title: `${data.value?.lane.title ?? 'A lane'} — DOF`,
  link: data.value ? [{ rel: 'canonical', href: laneCanonical(origin, data.value.lane.id) }] : [],
  // thinness law: an empty lane is useful to wanderers but not index-worthy
  meta: laneTotal.value === 0 ? [{ name: 'robots', content: 'noindex' }] : [],
}))
useSeoMeta(data.value ? laneMeta({ origin, laneId: data.value.lane.id, title: data.value.lane.title, blurb: data.value.lane.blurb }) : {})

// the street notices lane entrances (one per lane per page-load)
watchEffect(() => { if (import.meta.client && data.value) recordLaneView(data.value.lane.id, 'direct') })

const found = computed(() => data.value
  ? data.value.totals.shops + data.value.totals.products + data.value.totals.deals + data.value.totals.sparks
  : 0)
const clean = (t: string | null) => t ? t.replace(/[⟪⟫]/g, '') : null
function chose(kind: 'store' | 'product' | 'deal' | 'spark', id: string) {
  if (data.value) recordLaneClick(kind, id, data.value.lane.id)
}
</script>

<template>
  <main class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
    <div v-if="pending && !data" class="flex flex-col gap-3" aria-hidden="true">
      <DofSkeleton v-for="n in 3" :key="n" class="h-28 rounded-large" />
    </div>

    <template v-else-if="data">
      <header class="flex flex-col gap-2">
        <NuxtLink to="/home" class="text-caption text-foreground/50 underline-offset-4 hover:underline">← the street</NuxtLink>
        <DofText role="title" as="h1">{{ data.lane.title }}</DofText>
        <DofText role="body" tone="muted">{{ data.lane.blurb }}</DofText>
        <DofText role="caption" class="rounded-medium border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-foreground/70">
          {{ data.lane.inclusion }}
        </DofText>
        <NuxtLink
          v-if="data.lane.kind === 'search' && data.lane.q"
          :to="{ path: '/search', query: { q: data.lane.q } }"
          class="dof-interactive self-start rounded-full border border-foreground/15 px-3 py-1 text-caption text-foreground/70 hover:border-accent focus-visible:focus-ring"
        >
          Search within this idea →
        </NuxtLink>
      </header>

      <template v-if="found > 0">
        <section v-if="data.shops.length > 0" aria-label="shops" class="flex flex-col gap-3">
          <DofText role="emphasis" as="h2">Shops</DofText>
          <ul class="flex list-none flex-col gap-3 p-0">
            <li v-for="s in data.shops" :key="s.id">
              <NuxtLink :to="`/s/${s.handle}`" class="dof-interactive flex flex-col gap-1 rounded-large border border-foreground/10 bg-foreground/[0.02] p-4 transition-colors hover:border-accent focus-visible:focus-ring" @click="chose('store', s.id)">
                <div class="flex items-baseline gap-2">
                  <DofText role="body" class="font-medium">{{ s.name }}</DofText>
                  <DofText v-if="s.tagline" role="caption" class="text-foreground/60">{{ s.tagline }}</DofText>
                </div>
                <DofText v-if="clean(s.excerpt)" role="caption" class="line-clamp-2 text-foreground/70">{{ clean(s.excerpt) }}</DofText>
              </NuxtLink>
            </li>
          </ul>
        </section>

        <section v-if="data.products.length > 0" aria-label="things" class="flex flex-col gap-3">
          <DofText role="emphasis" as="h2">Things</DofText>
          <ul class="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
            <li v-for="p in data.products" :key="p.id">
              <NuxtLink :to="`/s/${p.store_handle}/p/${p.id}`" class="dof-interactive flex h-full gap-3 rounded-large border border-foreground/10 bg-foreground/[0.02] p-3 transition-colors hover:border-accent focus-visible:focus-ring" @click="chose('product', p.id)">
                <PublicImg v-if="p.image_url" :src="p.image_url" :alt="p.title" class="size-20 shrink-0 rounded-medium object-cover" />
                <div class="flex min-w-0 flex-col gap-1">
                  <div class="flex items-baseline justify-between gap-2">
                    <DofText role="body" class="truncate font-medium">{{ p.title }}</DofText>
                    <DofMoney v-if="p.price_minor !== null" :amount="p.price_minor" :currency="p.currency ?? 'EUR'" class="shrink-0 text-caption font-medium" />
                  </div>
                  <DofText role="caption" tone="muted">{{ p.store_name }}</DofText>
                </div>
              </NuxtLink>
            </li>
          </ul>
        </section>

        <section v-if="data.deals.length > 0" aria-label="deals" class="flex flex-col gap-3">
          <DofText role="emphasis" as="h2">Deals</DofText>
          <ul class="flex list-none flex-col gap-3 p-0">
            <li v-for="d in data.deals" :key="d.id">
              <NuxtLink :to="`/s/${d.store_handle}/d/${d.id}`" class="dof-interactive flex flex-col gap-1 rounded-large border border-accent/25 bg-accent/5 p-4 transition-colors hover:border-accent focus-visible:focus-ring" @click="chose('deal', d.id)">
                <DofText role="body" class="font-medium">{{ d.headline }}</DofText>
                <DofText role="caption" tone="muted">a deal at {{ d.store_name }}</DofText>
              </NuxtLink>
            </li>
          </ul>
        </section>

        <section v-if="data.sparks.length > 0" aria-label="voices" class="flex flex-col gap-3">
          <DofText role="emphasis" as="h2">Voices</DofText>
          <ul class="flex list-none flex-col gap-3 p-0">
            <li v-for="sp in data.sparks" :key="sp.id">
              <NuxtLink :to="`/s/${sp.store_handle}/sparks/${sp.id}`" class="dof-interactive flex flex-col gap-1 rounded-large border-s-2 border-foreground/20 bg-foreground/[0.02] p-4 transition-colors hover:border-accent focus-visible:focus-ring" @click="chose('spark', sp.id)">
                <DofText role="body" class="italic text-foreground/85">“{{ clean(sp.excerpt) }}…”</DofText>
                <DofText role="caption" tone="muted">— {{ sp.store_name }}</DofText>
              </NuxtLink>
            </li>
          </ul>
        </section>
      </template>

      <section v-else class="flex flex-col gap-3 rounded-large border border-foreground/10 p-6">
        <DofText role="emphasis" as="h2">Nothing here right now.</DofText>
        <DofText role="body" tone="muted">
          {{ data.lane.id === 'fresh-today' ? 'The street is still waking — nothing new in the last day. Yesterday’s street is one door back.' : 'This lane is quiet at the moment. The street keeps moving, though.' }}
        </DofText>
        <div class="flex flex-wrap gap-2">
          <NuxtLink to="/home" class="dof-interactive rounded-full border border-foreground/15 px-4 py-2 text-caption hover:border-accent focus-visible:focus-ring">Back to the street →</NuxtLink>
          <NuxtLink to="/shops" class="dof-interactive rounded-full border border-foreground/15 px-4 py-2 text-caption hover:border-accent focus-visible:focus-ring">Meet the shops →</NuxtLink>
        </div>
      </section>
    </template>
  </main>
</template>
