<script setup lang="ts">
/**
 * /search (LS-2) — ask the street.
 *
 * A first-class discovery door: query lives in the URL (shareable, Back-safe),
 * results are grouped in the street's own visual language (a shop is a maker,
 * a product is a thing, a spark is a voice, a deal is a moment), and matched
 * words are shown IN CONTEXT — the maker's own sentences do the selling.
 * Relevance is explainable (name > said-about > story; freshness ties) and the
 * fuzzy rescue announces itself honestly. Zero results never dead-end.
 */
import { computed, ref, watch } from 'vue'
import { DofText, DofMoney, DofSkeleton, DofButton, announce } from '@ds/index'
import { recordSearch, recordSearchClick } from '../composables/attention'

useHead({ title: 'Search the street — DOF', meta: [{ name: 'robots', content: 'noindex' }] })

type Scope = 'all' | 'shops' | 'products' | 'deals' | 'sparks'
interface ShopHit { id: string; handle: string; name: string; tagline: string | null; excerpt: string | null }
interface ProductHit { id: string; title: string; price_minor: number | null; currency: string | null; store_handle: string; store_name: string; image_url: string | null; excerpt: string | null }
interface DealHit { id: string; headline: string; store_handle: string; store_name: string; excerpt: string | null }
interface SparkHit { id: string; excerpt: string; store_handle: string; store_name: string }
interface SearchPayload {
  q: string; scope: Scope; page: number; fuzzy: boolean
  shops: ShopHit[]; products: ProductHit[]; deals: DealHit[]; sparks: SparkHit[]
  totals: { shops: number; products: number; deals: number; sparks: number }
}

const route = useRoute()
const router = useRouter()
const q = ref(String(route.query.q ?? ''))
const scope = computed<Scope>(() => {
  const s = String(route.query.scope ?? 'all')
  return (['all', 'shops', 'products', 'deals', 'sparks'] as const).includes(s as Scope) ? (s as Scope) : 'all'
})

const activeQ = computed(() => String(route.query.q ?? '').trim())
const { data, pending } = await useFetch<SearchPayload>('/api/v1/public/search', {
  query: computed(() => ({ q: activeQ.value, scope: scope.value })),
  immediate: activeQ.value.length >= 2,
  watch: [activeQ, scope],
  server: activeQ.value.length >= 2,
})

// deeper pages of a single scope accumulate below the first
const older = ref<Array<ShopHit | ProductHit | DealHit | SparkHit>>([])
const page = ref(1)
const loadingMore = ref(false)
watch([activeQ, scope], () => { older.value = []; page.value = 1 })

const found = computed(() => data.value
  ? data.value.totals.shops + data.value.totals.products + data.value.totals.deals + data.value.totals.sparks
  : 0)

// the street remembers what people looked for — and what it couldn't answer
let announced = ''
watch(data, (d) => {
  if (!d || activeQ.value.length < 2 || announced === `${activeQ.value}:${d.scope}`) return
  announced = `${activeQ.value}:${d.scope}`
  if (d.scope === 'all') recordSearch(activeQ.value, found.value > 0, 'search')
  announce(found.value > 0 ? `${found.value} found on the street` : 'nothing found — the street will remember')
}, { immediate: true })

let navTimer: ReturnType<typeof setTimeout> | null = null
function onInput() {
  if (navTimer) clearTimeout(navTimer)
  navTimer = setTimeout(() => {
    const next = q.value.trim()
    if (next === activeQ.value) return
    void router.replace({ query: next.length >= 2 ? { q: next } : {} })
  }, 350)
}
function submit() {
  if (navTimer) clearTimeout(navTimer)
  const next = q.value.trim()
  if (next.length >= 2) void router.replace({ query: { q: next } })
}
watch(() => route.query.q, (v) => { const s = String(v ?? ''); if (s !== q.value) q.value = s })

function widen(g: Exclude<Scope, 'all'>) {
  void router.push({ query: { q: activeQ.value, scope: g } })
}
async function showMore() {
  if (!data.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const next = await $fetch<SearchPayload>('/api/v1/public/search', {
      query: { q: activeQ.value, scope: scope.value, page: page.value + 1 },
    })
    page.value += 1
    older.value.push(...next.shops, ...next.products, ...next.deals, ...next.sparks)
  } finally { loadingMore.value = false }
}
const scopedTotal = computed(() => data.value && scope.value !== 'all' ? data.value.totals[scope.value] : 0)
const scopedShown = computed(() => {
  if (!data.value || scope.value === 'all') return 0
  return data.value[scope.value].length + older.value.length
})

function chose(kind: 'store' | 'product' | 'deal' | 'spark', id: string) {
  recordSearchClick(kind, id, activeQ.value)
}

/** ts_headline marks matches with ⟪⟫ — split into segments, render <mark> ourselves (never v-html). */
function segments(text: string | null): Array<{ t: string; hit: boolean }> {
  if (!text) return []
  return text.split(/(⟪[^⟫]*⟫)/).filter(Boolean).map((part) =>
    part.startsWith('⟪') ? { t: part.slice(1, -1), hit: true } : { t: part, hit: false })
}

const GROUPS = [
  { key: 'shops' as const, title: 'Shops & makers' },
  { key: 'products' as const, title: 'Things' },
  { key: 'deals' as const, title: 'Deals' },
  { key: 'sparks' as const, title: 'Voices from the street' },
]
</script>

<template>
  <main class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
    <header class="flex flex-col gap-3">
      <DofText role="title" as="h1">Search the street</DofText>
      <form role="search" class="flex gap-2" @submit.prevent="submit">
        <input
          v-model="q"
          type="search"
          name="q"
          autofocus
          enterkeyhint="search"
          placeholder="A thing, a maker, a word from a story…"
          aria-label="Search shops, things, deals, and stories"
          class="focus-visible:focus-ring w-full rounded-large border border-foreground/20 bg-transparent px-4 py-3 text-body outline-none placeholder:text-foreground/40"
          @input="onInput"
        >
      </form>
      <DofText v-if="activeQ.length < 2" role="caption" tone="muted">
        Ask for anything — “blankets”, “sourdough”, a maker’s name, or words from their story.
      </DofText>
    </header>

    <!-- honesty banner: near-spellings, said out loud -->
    <DofText v-if="data?.fuzzy && found > 0" role="caption" class="rounded-medium border border-caution/40 bg-caution/10 px-3 py-2">
      No exact words matched “{{ activeQ }}” — these are the closest names on the street.
    </DofText>

    <div v-if="pending && !data" class="flex flex-col gap-3" aria-hidden="true">
      <DofSkeleton v-for="n in 3" :key="n" class="h-28 rounded-large" />
    </div>

    <template v-else-if="data && found > 0">
      <section
        v-for="g in GROUPS.filter((g) => scope === 'all' ? data!.totals[g.key] > 0 : scope === g.key)"
        :key="g.key"
        :aria-label="g.title"
        class="flex flex-col gap-3"
      >
        <div class="flex items-baseline justify-between gap-2">
          <DofText role="emphasis" as="h2">{{ g.title }}</DofText>
          <DofText role="caption" tone="muted">{{ data.totals[g.key] }}</DofText>
        </div>

        <!-- shops: the maker card — name, tagline, and their own matched words -->
        <ul v-if="g.key === 'shops'" class="flex list-none flex-col gap-3 p-0">
          <li v-for="s in [...data.shops, ...(scope === 'shops' ? older as ShopHit[] : [])]" :key="s.id">
            <NuxtLink
              :to="`/s/${s.handle}`"
              class="dof-interactive flex flex-col gap-1 rounded-large border border-foreground/10 bg-foreground/[0.02] p-4 transition-colors hover:border-accent focus-visible:focus-ring"
              @click="chose('store', s.id)"
            >
              <div class="flex items-baseline gap-2">
                <DofText role="body" class="font-medium">{{ s.name }}</DofText>
                <DofText v-if="s.tagline" role="caption" class="text-foreground/60">{{ s.tagline }}</DofText>
              </div>
              <DofText v-if="s.excerpt" role="caption" class="text-foreground/70">
                <template v-for="(seg, i) in segments(s.excerpt)" :key="i"><mark v-if="seg.hit" class="rounded-sm bg-accent/20 px-0.5 text-inherit">{{ seg.t }}</mark><template v-else>{{ seg.t }}</template></template>
              </DofText>
            </NuxtLink>
          </li>
        </ul>

        <!-- products: the thing — image, price, matched description words -->
        <ul v-else-if="g.key === 'products'" class="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
          <li v-for="p in [...data.products, ...(scope === 'products' ? older as ProductHit[] : [])]" :key="p.id">
            <NuxtLink
              :to="`/s/${p.store_handle}/p/${p.id}`"
              class="dof-interactive flex h-full gap-3 rounded-large border border-foreground/10 bg-foreground/[0.02] p-3 transition-colors hover:border-accent focus-visible:focus-ring"
              @click="chose('product', p.id)"
            >
              <PublicImg v-if="p.image_url" :src="p.image_url" :alt="p.title" class="size-20 shrink-0 rounded-medium object-cover" />
              <div class="flex min-w-0 flex-col gap-1">
                <div class="flex items-baseline justify-between gap-2">
                  <DofText role="body" class="truncate font-medium">{{ p.title }}</DofText>
                  <DofMoney v-if="p.price_minor !== null" :amount="p.price_minor" :currency="p.currency ?? 'EUR'" class="shrink-0 text-caption font-medium" />
                </div>
                <DofText role="caption" tone="muted">{{ p.store_name }}</DofText>
                <DofText v-if="p.excerpt" role="caption" class="line-clamp-2 text-foreground/70">
                  <template v-for="(seg, i) in segments(p.excerpt)" :key="i"><mark v-if="seg.hit" class="rounded-sm bg-accent/20 px-0.5 text-inherit">{{ seg.t }}</mark><template v-else>{{ seg.t }}</template></template>
                </DofText>
              </div>
            </NuxtLink>
          </li>
        </ul>

        <!-- deals: the moment -->
        <ul v-else-if="g.key === 'deals'" class="flex list-none flex-col gap-3 p-0">
          <li v-for="d in [...data.deals, ...(scope === 'deals' ? older as DealHit[] : [])]" :key="d.id">
            <NuxtLink
              :to="`/s/${d.store_handle}/d/${d.id}`"
              class="dof-interactive flex flex-col gap-1 rounded-large border border-accent/25 bg-accent/5 p-4 transition-colors hover:border-accent focus-visible:focus-ring"
              @click="chose('deal', d.id)"
            >
              <DofText role="body" class="font-medium">{{ d.headline }}</DofText>
              <DofText role="caption" tone="muted">a deal at {{ d.store_name }}</DofText>
              <DofText v-if="d.excerpt" role="caption" class="text-foreground/70">
                <template v-for="(seg, i) in segments(d.excerpt)" :key="i"><mark v-if="seg.hit" class="rounded-sm bg-accent/20 px-0.5 text-inherit">{{ seg.t }}</mark><template v-else>{{ seg.t }}</template></template>
              </DofText>
            </NuxtLink>
          </li>
        </ul>

        <!-- sparks: the voice — the matched sentence IS the card -->
        <ul v-else class="flex list-none flex-col gap-3 p-0">
          <li v-for="sp in [...data.sparks, ...(scope === 'sparks' ? older as SparkHit[] : [])]" :key="sp.id">
            <NuxtLink
              :to="`/s/${sp.store_handle}/sparks/${sp.id}`"
              class="dof-interactive flex flex-col gap-1 rounded-large border-s-2 border-foreground/20 bg-foreground/[0.02] p-4 ps-4 transition-colors hover:border-accent focus-visible:focus-ring"
              @click="chose('spark', sp.id)"
            >
              <DofText role="body" class="italic text-foreground/85">
                “<template v-for="(seg, i) in segments(sp.excerpt)" :key="i"><mark v-if="seg.hit" class="rounded-sm bg-accent/20 px-0.5 text-inherit">{{ seg.t }}</mark><template v-else>{{ seg.t }}</template></template>…”
              </DofText>
              <DofText role="caption" tone="muted">— {{ sp.store_name }}</DofText>
            </NuxtLink>
          </li>
        </ul>

        <button
          v-if="scope === 'all' && data.totals[g.key] > data[g.key].length"
          type="button"
          class="dof-interactive self-start rounded-full border border-foreground/15 px-3 py-1 text-caption text-foreground/70 hover:border-accent focus-visible:focus-ring"
          @click="widen(g.key)"
        >
          All {{ data.totals[g.key] }} {{ g.title.toLowerCase() }} →
        </button>
      </section>

      <div v-if="scope !== 'all'" class="flex items-center gap-3">
        <DofButton v-if="scopedShown < scopedTotal" variant="soft" tone="neutral" :loading="loadingMore" @click="showMore">
          Show more ({{ scopedShown }} of {{ scopedTotal }})
        </DofButton>
        <NuxtLink :to="{ path: '/search', query: { q: activeQ } }" class="text-caption text-foreground/60 underline underline-offset-4">
          ← everything for “{{ activeQ }}”
        </NuxtLink>
      </div>
    </template>

    <!-- zero results: acknowledged, remembered, never a dead end -->
    <section v-else-if="data && activeQ.length >= 2" class="flex flex-col gap-4 rounded-large border border-foreground/10 p-6" aria-live="polite">
      <DofText role="emphasis" as="h2">Nothing on the street answers to “{{ activeQ }}” — yet.</DofText>
      <DofText role="body" tone="muted">
        The street remembers what people look for. Missing words like yours are how it learns what to bring next.
      </DofText>
      <div class="flex flex-wrap gap-2">
        <NuxtLink to="/shops" class="dof-interactive rounded-full border border-foreground/15 px-4 py-2 text-caption hover:border-accent focus-visible:focus-ring">Meet the shops →</NuxtLink>
        <NuxtLink to="/home" class="dof-interactive rounded-full border border-foreground/15 px-4 py-2 text-caption hover:border-accent focus-visible:focus-ring">See what’s happening today →</NuxtLink>
      </div>
    </section>
  </main>
</template>
