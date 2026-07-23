<script setup lang="ts">
/**
 * /deals — Create Deal (Release 0.3). The first social artifact: pick something already
 * on your store, give it a headline and a short story, see the preview live, publish,
 * share. Merchant language only — no "promotion engine", no configuration. The preview
 * IS the form: what you type is what the world gets.
 */
import { computed, ref, watch } from 'vue'
import {
  DofText, DofButton, DofInput, DofTextarea, DofChip, DofMoney,
  DofEmptyState, DofSkeleton, DofProblem, announce,
} from '@ds/index'
import { useCopyFeedback } from '../composables/use-copy'
import { useDevHeaders } from '../composables/dev-headers'
import { useArmedAction } from '../composables/use-armed-action'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Deals — DOF' })

// ——— workspace context (same spine as the Composer)
const headers = useDevHeaders()
const { data: workspace } = useFetch<{ businesses: Array<{ business_id: string; stores: Array<{ store_id: string; handle: string }> }> }>('/api/v1/workspace', {
  lazy: true, server: false, headers,
})
const businessId = computed(() => workspace.value?.businesses[0]?.business_id ?? null)
const storeId = computed(() => workspace.value?.businesses[0]?.stores[0]?.store_id ?? null)
const storeHandle = computed(() => workspace.value?.businesses[0]?.stores[0]?.handle ?? null)

// ——— what's on the store (a deal needs something to point at)
interface GridRow { id: string; title: string; min_price_amount: number | null; price_currency: string | null; on_store: boolean; image_url: string | null; image_alt: string | null }
const { data: grid, refresh: refreshGrid, pending: gridPending } = useFetch<{ items: GridRow[] }>(
  () => `/api/v1/products?business_id=${businessId.value}&limit=24${storeId.value ? `&channel_id=${storeId.value}` : ''}`,
  { lazy: true, server: false, headers, immediate: false },
)
const onStore = computed(() => (grid.value?.items ?? []).filter((p) => p.on_store))

// ——— the merchant's deals
interface DealItem { id: string; product_id: string; headline: string; story: string | null; status: 'published' | 'ended'; published_at: string; fires: number; saves: number }
const { data: deals, refresh: refreshDeals, pending: dealsPending } = useFetch<{ items: DealItem[] }>(
  () => `/api/v1/deals?business_id=${businessId.value}`,
  { lazy: true, server: false, headers, immediate: false },
)
watch(businessId, (id) => { if (id) { void refreshGrid(); void refreshDeals() } }, { immediate: true })
const productTitle = (id: string) => grid.value?.items.find((p) => p.id === id)?.title ?? 'a product'

// ——— composing the deal
const selectedId = ref<string | null>(null)
const selected = computed(() => onStore.value.find((p) => p.id === selectedId.value) ?? null)
const headline = ref('')
const story = ref('')
const canPublish = computed(() => selected.value !== null && headline.value.trim().length > 0 && headline.value.trim().length <= 90 && story.value.trim().length <= 600)

const publishing = ref(false)
const problem = ref('')
const justPublished = ref<{ headline: string; dealId: string } | null>(null)
const dealUrl = (id: string) => `/s/${storeHandle.value}/d/${id}`

async function publishDeal() {
  if (!canPublish.value || !storeId.value || publishing.value) return
  publishing.value = true
  problem.value = ''
  try {
    const created = await $fetch<{ deal_id: string }>('/api/v1/deals', {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
      body: {
        product_id: selected.value!.id, store_id: storeId.value,
        headline: headline.value.trim(), story: story.value.trim() || null,
      },
    })
    justPublished.value = { headline: headline.value.trim(), dealId: created.deal_id }
    announce('Your deal is live.')
    selectedId.value = null; headline.value = ''; story.value = ''
    await refreshDeals()
  } catch (error) {
    problem.value = (error as { data?: { detail?: string } }).data?.detail ?? 'That didn’t take — try again.'
  } finally {
    publishing.value = false
  }
}

const { copiedId, copy } = useCopyFeedback()
const copyDealLink = (id: string) => copy(id, `${window.location.origin}${dealUrl(id)}`)

const ending = ref<string | null>(null)
const { armedId, arm } = useArmedAction('Tap again to end this deal.')
function armOrEnd(deal: DealItem) {
  if (arm(deal.id)) void endDeal(deal)
}
async function endDeal(deal: DealItem) {
  if (!businessId.value || ending.value) return
  ending.value = deal.id
  try {
    await $fetch(`/api/v1/deals/${deal.id}/end`, {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
      body: { business_id: businessId.value },
    })
    announce(`“${deal.headline}” has ended.`)
    await refreshDeals()
  } catch (error) {
    announce((error as { data?: { detail?: string } }).data?.detail ?? 'That didn’t take — try again.')
  } finally {
    ending.value = null
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
    <PageHeader title="Deals" subtitle="Give one of your products a moment — a headline, a story, a link worth sharing." />

    <!-- ——— just published: View live → Copy link → share (the Release 0.2 idiom) -->
    <PublishedBar v-if="justPublished && storeHandle" :live-url="dealUrl(justPublished.dealId)" @dismiss="justPublished = null">
      <strong>“{{ justPublished.headline }}”</strong> is live.
    </PublishedBar>

    <!-- ——— create: pick → describe → publish (the preview IS the form) -->
    <section aria-label="create a deal" class="flex flex-col gap-4">
      <DofText role="emphasis" as="h2">Create a deal</DofText>

      <div v-if="gridPending && businessId" class="flex gap-2" aria-hidden="true">
        <DofSkeleton v-for="n in 3" :key="n" class="h-9 w-32 rounded-full" />
      </div>
      <DofEmptyState
        v-else-if="onStore.length === 0"
        icon="package"
        title="Put a product on your store first"
        why="A deal points at something the world can already see — publish a product, then come back."
      >
        <NuxtLink to="/products" class="contents"><DofButton tone="accent">Go to products</DofButton></NuxtLink>
      </DofEmptyState>

      <template v-else>
        <div class="flex flex-wrap gap-2" role="group" aria-label="choose a product">
          <DofChip
            v-for="p in onStore" :key="p.id"
            :label="p.title"
            :selected="selectedId === p.id"
            selectable @toggle="selectedId = selectedId === p.id ? null : p.id"
          />
        </div>

        <template v-if="selected">
          <DofInput
            v-model="headline"
            label="Headline"
            :hint="`The hook — up to 90 characters. ${90 - headline.trim().length} left.`"
            placeholder="This weekend: every blanket ships free"
            :maxlength="90"
          />
          <DofTextarea
            v-model="story"
            label="Story"
            hint="Optional — why this, why now. Up to 600 characters."
            placeholder="We just finished a big batch of lavender blankets and want them keeping people warm, not sitting on our shelves…"
            :rows="3"
            :maxlength="600"
          />

          <!-- live preview: exactly the public deal card -->
          <div class="flex flex-col gap-2 rounded-large border border-line bg-surface-raised p-4" aria-label="preview">
            <DofText role="caption" tone="muted">Preview — this is what people see</DofText>
            <DofText role="caption" class="uppercase tracking-widest text-accent">A deal from your store</DofText>
            <DofText role="title" as="p">{{ headline.trim() || 'Your headline goes here' }}</DofText>
            <DofText v-if="story.trim()" role="body" class="text-foreground/90">{{ story.trim() }}</DofText>
            <div class="mt-1 flex items-center gap-3 rounded-medium border border-line p-3">
              <img v-if="selected.image_url" :src="selected.image_url" :alt="selected.image_alt ?? selected.title" class="size-14 rounded-small object-cover">
              <div v-else class="flex size-14 items-center justify-center rounded-small bg-accent/10 text-caption text-foreground/60" aria-hidden="true">·</div>
              <div class="flex min-w-0 flex-col">
                <DofText role="body" class="truncate font-medium">{{ selected.title }}</DofText>
                <DofMoney v-if="selected.min_price_amount" :amount="selected.min_price_amount" :currency="selected.price_currency ?? 'EUR'" class="text-caption text-muted-foreground" />
              </div>
            </div>
          </div>

          <DofProblem v-if="problem" title="Nothing was lost" :detail="problem" />
          <div>
            <DofButton tone="accent" size="lg" icon="sparkles" :disabled="!canPublish" :loading="publishing" @click="publishDeal">
              Publish deal
            </DofButton>
          </div>
        </template>
      </template>
    </section>

    <!-- ——— your deals -->
    <section aria-label="your deals" class="flex flex-col gap-3">
      <DofText role="emphasis" as="h2">Your deals</DofText>
      <div v-if="dealsPending && businessId" class="flex flex-col gap-2" aria-hidden="true">
        <DofSkeleton v-for="n in 2" :key="n" class="h-16 rounded-large" />
      </div>
      <ul v-else-if="deals && deals.items.length > 0" class="flex list-none flex-col gap-2 p-0">
        <li v-for="d in deals.items" :key="d.id" class="flex flex-wrap items-center gap-2 rounded-large border border-line p-3">
          <div class="flex min-w-0 flex-1 flex-col">
            <DofText role="body" class="truncate font-medium">{{ d.headline }}</DofText>
            <DofText role="caption" :tone="d.status === 'published' ? undefined : 'muted'" :class="d.status === 'published' && 'text-positive'">
              {{ d.status === 'published' ? `● Live — ${productTitle(d.product_id)}` : `○ Ended — ${productTitle(d.product_id)}` }}
            </DofText>
            <DofText v-if="d.fires + d.saves > 0" role="caption" tone="muted">
              🔥 {{ d.fires }} · saved {{ d.saves }}
            </DofText>
          </div>
          <template v-if="d.status === 'published' && storeHandle">
            <NuxtLink :to="`${dealUrl(d.id)}?v=${Date.now()}`" target="_blank" class="contents">
              <DofButton size="sm" variant="ghost" tone="neutral" icon="external-link">View live</DofButton>
            </NuxtLink>
            <DofButton size="sm" variant="ghost" tone="neutral" icon="copy" @click="copyDealLink(d.id)">{{ copiedId === d.id ? 'Copied ✓' : 'Copy link' }}</DofButton>
            <DofButton size="sm" :variant="armedId === d.id ? 'soft' : 'ghost'" :tone="armedId === d.id ? 'critical' : 'neutral'" :loading="ending === d.id" @click="armOrEnd(d)">{{ armedId === d.id ? 'Really end it?' : 'End deal' }}</DofButton>
          </template>
        </li>
      </ul>
      <DofEmptyState
        v-else
        icon="sparkles"
        title="Your first deal goes here"
        why="Deals are how people discover you — one headline can travel further than a whole catalog."
      />
    </section>
  </div>
</template>
