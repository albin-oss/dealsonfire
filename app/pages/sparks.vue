<script setup lang="ts">
/**
 * /sparks — the Spark composer + timeline (Release 0.6). The coming-soon stub becomes
 * the merchant's voice: one honest textarea (what's happening in the shop today?),
 * an optional photo through the Media Port, an optional product pointer, publish →
 * View live → Copy link. No threads, no algorithm — just saying something worth reading.
 */
import { computed, ref, watch } from 'vue'
import {
  DofText, DofButton, DofTextarea, DofChip, DofMediaSlot,
  DofEmptyState, DofSkeleton, DofProblem, announce, type SlotMedia,
} from '@ds/index'
import { devUserId } from '../composables/ignite/launch'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Sparks — DOF' })

// ——— workspace context (the same spine as Products, Deals, Store)
const headers = { 'x-dof-user-id': import.meta.client ? devUserId() : '' }
const { data: workspace } = useFetch<{ businesses: Array<{ business_id: string; stores: Array<{ store_id: string; handle: string; name: string }> }> }>('/api/v1/workspace', {
  lazy: true, server: false, headers,
})
const businessId = computed(() => workspace.value?.businesses[0]?.business_id ?? null)
const store = computed(() => workspace.value?.businesses[0]?.stores[0] ?? null)

// ——— on-store products (optional pointer; same rule as deals)
interface GridRow { id: string; title: string; on_store: boolean }
const { data: grid, refresh: refreshGrid } = useFetch<{ items: GridRow[] }>(
  () => `/api/v1/products?business_id=${businessId.value}&limit=24${store.value ? `&channel_id=${store.value.store_id}` : ''}`,
  { lazy: true, server: false, headers, immediate: false },
)
const onStore = computed(() => (grid.value?.items ?? []).filter((p) => p.on_store))

// ——— the timeline
interface SparkItem { id: string; body: string; published_at: string; product_id: string | null; image_url: string | null; fires: number }
const { data: timeline, refresh: refreshTimeline, pending: timelinePending } = useFetch<{ items: SparkItem[] }>(
  () => `/api/v1/sparks?business_id=${businessId.value}`,
  { lazy: true, server: false, headers, immediate: false },
)
watch(businessId, (id) => { if (id) { void refreshGrid(); void refreshTimeline() } }, { immediate: true })

// ——— composing
const body = ref('')
const media = ref<SlotMedia | null>(null)
const productId = ref<string | null>(null)
const canPublish = computed(() => body.value.trim().length > 0 && body.value.trim().length <= 500)

async function uploadMedia(file: File): Promise<{ mediaId: string; url: string }> {
  const form = new FormData()
  form.append('file', file)
  form.append('business_id', businessId.value ?? '')
  const res = await $fetch<{ media_id: string; url: string }>('/api/v1/media', { method: 'POST', body: form, headers })
  return { mediaId: res.media_id, url: res.url }
}

const publishing = ref(false)
const problem = ref('')
const justPublished = ref<{ sparkId: string } | null>(null)
const sparkUrl = (id: string) => `/s/${store.value?.handle}/sparks/${id}`

async function publish() {
  if (!canPublish.value || !businessId.value || !store.value || publishing.value) return
  publishing.value = true
  problem.value = ''
  try {
    const created = await $fetch<{ spark_id: string }>('/api/v1/sparks', {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
      body: {
        business_id: businessId.value, store_id: store.value.store_id,
        body: body.value.trim(),
        ...(media.value ? { media_id: media.value.mediaId } : {}),
        ...(productId.value ? { product_id: productId.value } : {}),
      },
    })
    justPublished.value = { sparkId: created.spark_id }
    announce('Your spark is live.')
    body.value = ''; media.value = null; productId.value = null
    await refreshTimeline()
  } catch (error) {
    problem.value = (error as { data?: { detail?: string } }).data?.detail ?? 'That didn’t take — nothing was lost; try again.'
  } finally {
    publishing.value = false
  }
}

async function copySparkLink(id: string) {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}${sparkUrl(id)}`)
    announce('Link copied — send it to someone.')
  } catch { announce(`${window.location.origin}${sparkUrl(id)}`) }
}

const deleting = ref<string | null>(null)
async function deleteSpark(spark: SparkItem) {
  if (!businessId.value || deleting.value) return
  deleting.value = spark.id
  try {
    await $fetch(`/api/v1/sparks/${spark.id}/delete`, {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
      body: { business_id: businessId.value },
    })
    announce('Spark taken down.')
    await refreshTimeline()
  } catch (error) {
    announce((error as { data?: { detail?: string } }).data?.detail ?? 'That didn’t take — try again.')
  } finally {
    deleting.value = null
  }
}

const productTitle = (id: string | null) => (id ? grid.value?.items.find((p) => p.id === id)?.title ?? null : null)
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
    <section class="flex flex-col gap-1">
      <DofText role="headline" as="h1">Sparks</DofText>
      <DofText role="body" tone="muted">What’s happening in the shop today? Short, honest, worth reading.</DofText>
    </section>

    <!-- ——— just published: View live → Copy link (the Release 0.2 idiom) -->
    <section
      v-if="justPublished && store"
      class="flex flex-wrap items-center gap-3 rounded-large border border-positive/40 bg-positive/5 p-4"
      aria-live="polite"
    >
      <DofText role="body" class="flex-1">Your spark is live.</DofText>
      <NuxtLink :to="`${sparkUrl(justPublished.sparkId)}?v=${Date.now()}`" target="_blank" class="contents">
        <DofButton size="sm" tone="accent" icon="external-link">View live</DofButton>
      </NuxtLink>
      <DofButton size="sm" variant="soft" tone="neutral" icon="copy" @click="copySparkLink(justPublished.sparkId)">Copy link</DofButton>
      <DofButton size="sm" variant="ghost" tone="neutral" icon="x" aria-label="Dismiss" @click="justPublished = null" />
    </section>

    <!-- ——— the composer -->
    <DofEmptyState
      v-if="workspace && !store"
      icon="flame"
      title="Your store comes first"
      why="Sparks are your store talking — Ignite opens the doors in about four minutes."
    >
      <NuxtLink to="/ignite" class="contents"><DofButton tone="accent">Start Ignite</DofButton></NuxtLink>
    </DofEmptyState>

    <section v-else-if="store" aria-label="write a spark" class="flex flex-col gap-3">
      <DofTextarea
        v-model="body"
        label="What’s new?"
        :hint="`New arrivals, limited stock, behind the scenes… ${500 - body.trim().length} characters left.`"
        placeholder="Fresh batch of lavender blankets coming off the needles this week — three left from the last one."
        :rows="3"
        :maxlength="500"
      />
      <DofMediaSlot v-if="businessId" v-model="media" :upload="uploadMedia" />
      <div v-if="onStore.length > 0" class="flex flex-col gap-1.5">
        <DofText role="caption" tone="muted">Point it at a product (optional):</DofText>
        <div class="flex flex-wrap gap-2" role="group" aria-label="attach a product">
          <DofChip
            v-for="p in onStore" :key="p.id"
            :label="p.title"
            :selected="productId === p.id"
            @click="productId = productId === p.id ? null : p.id"
          />
        </div>
      </div>
      <DofProblem v-if="problem" title="Nothing was lost" :detail="problem" />
      <div>
        <DofButton tone="accent" size="lg" icon="flame" :disabled="!canPublish" :loading="publishing" @click="publish">
          Publish spark
        </DofButton>
      </div>
    </section>

    <!-- ——— the timeline -->
    <section aria-label="your sparks" class="flex flex-col gap-3">
      <DofText role="emphasis" as="h2">Your sparks</DofText>
      <div v-if="timelinePending && businessId" class="flex flex-col gap-2" aria-hidden="true">
        <DofSkeleton v-for="n in 2" :key="n" class="h-20 rounded-large" />
      </div>
      <ul v-else-if="timeline && timeline.items.length > 0" class="flex list-none flex-col gap-2 p-0">
        <li v-for="sp in timeline.items" :key="sp.id" class="flex flex-col gap-2 rounded-large border border-line p-3">
          <div class="flex items-start gap-3">
            <img v-if="sp.image_url" :src="sp.image_url" alt="" class="size-14 shrink-0 rounded-small object-cover">
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
              <DofText role="body" class="line-clamp-2">{{ sp.body }}</DofText>
              <DofText role="caption" tone="muted">
                {{ sp.fires > 0 ? `🔥 ${sp.fires}` : 'Live' }}{{ productTitle(sp.product_id) ? ` · points at ${productTitle(sp.product_id)}` : '' }}
              </DofText>
            </div>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <NuxtLink v-if="store" :to="`${sparkUrl(sp.id)}?v=${Date.now()}`" target="_blank" class="contents">
              <DofButton size="sm" variant="ghost" tone="neutral" icon="external-link">View live</DofButton>
            </NuxtLink>
            <DofButton size="sm" variant="ghost" tone="neutral" icon="copy" @click="copySparkLink(sp.id)">Copy link</DofButton>
            <DofButton size="sm" variant="ghost" tone="neutral" icon="trash-2" :loading="deleting === sp.id" @click="deleteSpark(sp)">Take down</DofButton>
          </div>
        </li>
      </ul>
      <DofEmptyState
        v-else
        icon="flame"
        title="Your first spark goes here"
        why="Stores that talk get remembered — one honest line about today beats a silent shelf."
      />
    </section>
  </div>
</template>
