<script setup lang="ts">
/**
 * /products/:id — the product detail (Capability 01). The lifecycle's missing heart:
 * until now a product could be created but never edited. Everything here rides
 * endpoints that have existed since the Catalog era — this page is their first
 * merchant-facing surface. Every mutation states its state (saving / saved / failed).
 */
import { computed, ref, watch } from 'vue'
import {
  DofText, DofButton, DofInput, DofTextarea, DofBadge, DofMoney, DofChip,
  DofSkeleton, DofProblem, announce,
} from '@ds/index'
import { useDevHeaders } from '../../composables/dev-headers'
import { useArmedAction } from '../../composables/use-armed-action'
import { useCopyFeedback } from '../../composables/use-copy'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const router = useRouter()
const productId = computed(() => String(route.params.productId ?? ''))
const headers = useDevHeaders()

interface MediaRow { product_media_id: string; media_id: string; role: string; alt_text: string | null; position: number; url: string | null }
interface Detail {
  product_id: string
  business_id: string
  title: string
  description: { format?: string; content?: string } | null
  status: 'draft' | 'active' | 'archived'
  options: Array<{ name: string; values: string[] }>
  variants: Array<{ variant_id: string; sku: string; option_values: Record<string, string>; price: { amount: number; currency: string } }>
  media: MediaRow[]
  readiness: { ready: boolean; missing: string[] }
}

const { data: product, refresh, pending } = useFetch<Detail>(
  () => `/api/v1/products/${productId.value}`,
  { lazy: true, server: false, headers },
)
useHead({ title: () => `${product.value?.title ?? 'Product'} — DOF` })

// workspace context: the store (for publish/unpublish + live link)
const { data: workspaceData } = useFetch<{ businesses: Array<{ business_id: string; stores: Array<{ store_id: string; handle: string }> }> }>('/api/v1/workspace', {
  lazy: true, server: false, headers,
})
const store = computed(() => workspaceData.value?.businesses[0]?.stores[0] ?? null)

// on-store state comes from the grid read (one cheap annotated call)
const { data: gridRow, refresh: refreshOnStore } = useFetch<{ items: Array<{ id: string; on_store: boolean }> }>(
  () => `/api/v1/products?business_id=${product.value?.business_id}&q=&limit=100${store.value ? `&channel_id=${store.value.store_id}` : ''}&show_archived=true`,
  { lazy: true, server: false, headers, immediate: false },
)
watch([product, store], ([p, s]) => { if (p && s) void refreshOnStore() })
const onStore = computed(() => gridRow.value?.items.find((i) => i.id === productId.value)?.on_store ?? false)

// ——— editable fields with explicit save state
const title = ref('')
const description = ref('')
const priceMinor = ref<number | null>(null)
watch(product, (p) => {
  if (!p) return
  title.value = p.title
  description.value = p.description?.content ?? ''
  priceMinor.value = p.variants[0]?.price.amount ?? null
}, { immediate: true })

const dirty = computed(() => product.value !== null && product.value !== undefined && (
  title.value.trim() !== product.value.title ||
  description.value.trim() !== (product.value.description?.content ?? '') ||
  priceMinor.value !== (product.value.variants[0]?.price.amount ?? null)
))

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'
const saveState = ref<SaveState>('idle')
const problem = ref('')

async function save() {
  if (!product.value || !dirty.value || saveState.value === 'saving') return
  saveState.value = 'saving'
  problem.value = ''
  try {
    const patches: Promise<unknown>[] = []
    if (title.value.trim() !== product.value.title || description.value.trim() !== (product.value.description?.content ?? '')) {
      patches.push($fetch(`/api/v1/products/${productId.value}`, {
        method: 'PATCH',
        headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
        body: {
          ...(title.value.trim() !== product.value.title ? { title: title.value.trim() } : {}),
          ...(description.value.trim() !== (product.value.description?.content ?? '')
            ? { description: description.value.trim() ? { format: 'plain', content: description.value.trim() } : null }
            : {}),
        },
      }))
    }
    const variant = product.value.variants[0]
    if (variant && priceMinor.value !== null && priceMinor.value !== variant.price.amount) {
      patches.push($fetch(`/api/v1/products/${productId.value}/variants/${variant.variant_id}`, {
        method: 'PATCH',
        headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
        body: { price: { amount: priceMinor.value, currency: variant.price.currency } },
      }))
    }
    await Promise.all(patches)
    await refresh()
    saveState.value = 'saved'
    announce('Saved.')
    setTimeout(() => { if (saveState.value === 'saved') saveState.value = 'idle' }, 2500)
  } catch (error) {
    saveState.value = 'failed'
    problem.value = (error as { data?: { detail?: string } }).data?.detail ?? 'That didn’t take — nothing was lost; try again.'
  }
}

// ——— lifecycle: publish / unpublish / archive / restore / duplicate
const busy = ref<string | null>(null)
async function act(name: string, path: string, body?: Record<string, unknown>) {
  if (busy.value) return
  busy.value = name
  problem.value = ''
  try {
    await $fetch(path, { method: 'POST', headers: { ...headers, 'idempotency-key': crypto.randomUUID() }, body })
    await Promise.all([refresh(), refreshOnStore()])
    announce(`${name} — done.`)
  } catch (error) {
    problem.value = (error as { data?: { detail?: string } }).data?.detail ?? 'That didn’t take — try again.'
  } finally {
    busy.value = null
  }
}
const publish = () => store.value && act('Put on your store', `/api/v1/products/${productId.value}/publish-to-store`, { store_id: store.value.store_id })
const unpublish = () => store.value && act('Hidden from your store', `/api/v1/products/${productId.value}/unpublish-from-store`, { store_id: store.value.store_id })
const restore = () => act('Restored', `/api/v1/products/${productId.value}/restore`)
const { armedId, arm } = useArmedAction('Tap again to archive this product.')
function armOrArchive() {
  if (arm('archive')) void act('Archived', `/api/v1/products/${productId.value}/archive`)
}

async function duplicate() {
  if (!product.value || busy.value) return
  busy.value = 'duplicate'
  try {
    const created = await $fetch<{ product_id: string }>('/api/v1/products', {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
      body: {
        business_id: product.value.business_id,
        title: `${product.value.title} (copy)`,
        fulfillment_kind: 'physical',
        ...(product.value.description?.content ? { description: { format: 'plain', content: product.value.description.content } } : {}),
        ...(product.value.variants[0] ? { default_price: { amount: product.value.variants[0].price.amount, currency: product.value.variants[0].price.currency } } : {}),
      },
    })
    announce('Duplicated — you are now editing the copy.')
    await router.push(`/products/${created.product_id}`)
  } catch (error) {
    problem.value = (error as { data?: { detail?: string } }).data?.detail ?? 'That didn’t take — try again.'
  } finally {
    busy.value = null
  }
}

// ——— media management (existing endpoints: attach / remove / reorder)
const mediaBusy = ref(false)
async function addPhoto(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !product.value || mediaBusy.value) return
  mediaBusy.value = true
  problem.value = ''
  try {
    const form = new FormData()
    form.append('file', file)
    form.append('business_id', product.value.business_id)
    const up = await $fetch<{ media_id: string }>('/api/v1/media', { method: 'POST', body: form, headers })
    await $fetch(`/api/v1/products/${productId.value}/media`, {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
      body: { media_id: up.media_id, role: product.value.media.length === 0 ? 'hero' : 'gallery', alt_text: title.value.trim() || null },
    })
    await refresh()
    announce('Photo added.')
  } catch (error) {
    problem.value = (error as { data?: { detail?: string } }).data?.detail ?? 'That photo didn’t take — try again.'
  } finally {
    mediaBusy.value = false
    ;(event.target as HTMLInputElement).value = ''
  }
}
async function removePhoto(row: MediaRow) {
  if (mediaBusy.value) return
  mediaBusy.value = true
  try {
    await $fetch(`/api/v1/products/${productId.value}/media/${row.product_media_id}`, {
      method: 'DELETE', headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
    })
    await refresh()
    announce('Photo removed.')
  } finally { mediaBusy.value = false }
}
async function movePhoto(row: MediaRow, dir: -1 | 1) {
  if (!product.value || mediaBusy.value) return
  const ordered = [...product.value.media].sort((a, b) => a.position - b.position).map((m) => m.product_media_id)
  const i = ordered.indexOf(row.product_media_id)
  const j = i + dir
  if (j < 0 || j >= ordered.length) return
  ;[ordered[i], ordered[j]] = [ordered[j]!, ordered[i]!]
  mediaBusy.value = true
  try {
    await $fetch(`/api/v1/products/${productId.value}/media/order`, {
      method: 'PUT', headers: { ...headers, 'idempotency-key': crypto.randomUUID() }, body: { ordered_ids: ordered },
    })
    await refresh()
  } finally { mediaBusy.value = false }
}

// ——— sizes & colors (Increment 09) — the composer's promise, kept on the detail
// page. Options assign existing variants; missing combinations appear as GHOST
// rows: one tap makes them real, price prefilled from the first variant.
const showOptionForm = ref(false)
const optionName = ref('')
const optionValues = ref('')
const optionBusy = ref(false)
const OPTION_SUGGESTIONS = ['Size', 'Color', 'Style']

async function addOption() {
  if (!product.value || optionBusy.value) return
  const name = optionName.value.trim()
  const values = optionValues.value.split(',').map((v) => v.trim()).filter(Boolean)
  if (!name || values.length === 0) {
    problem.value = 'Name what varies, and list the options — like “Size” and “S, M, L”.'
    return
  }
  optionBusy.value = true
  problem.value = ''
  try {
    await $fetch(`/api/v1/products/${productId.value}/options`, {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
      body: { name, values, existing_variants_value: values[0] },
    })
    await refresh()
    announce(`${name} added — your current setup is the “${values[0]}” one; tap the others to add them.`)
    showOptionForm.value = false
    optionName.value = ''
    optionValues.value = ''
  } catch (error) {
    problem.value = (error as { data?: { detail?: string } }).data?.detail ?? 'That didn’t take — try again.'
  } finally {
    optionBusy.value = false
  }
}

/** Every combination of option values that doesn't have a variant yet. */
const ghostCombos = computed<Array<Record<string, string>>>(() => {
  const opts = product.value?.options ?? []
  if (opts.length === 0) return []
  let combos: Array<Record<string, string>> = [{}]
  for (const option of opts) {
    combos = combos.flatMap((c) => option.values.map((v) => ({ ...c, [option.name]: v })))
  }
  const existing = new Set((product.value?.variants ?? []).map((v) => JSON.stringify(
    Object.fromEntries(Object.entries(v.option_values).sort()))))
  return combos.filter((c) => !existing.has(JSON.stringify(Object.fromEntries(Object.entries(c).sort())))).slice(0, 12)
})
const comboLabel = (values: Record<string, string>) => Object.values(values).join(' / ') || '—'

const variantBusy = ref<string | null>(null)
async function makeReal(combo: Record<string, string>) {
  if (!product.value || variantBusy.value) return
  const key = JSON.stringify(combo)
  variantBusy.value = key
  try {
    const base = product.value.variants[0]
    await $fetch(`/api/v1/products/${productId.value}/variants`, {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
      body: { option_values: combo, price: base ? { amount: base.price.amount, currency: base.price.currency } : { amount: 0, currency: 'EUR' } },
    })
    await refresh()
    announce(`${comboLabel(combo)} added — same price as ${base ? comboLabel(base.option_values) : 'the original'} until you change it.`)
  } catch (error) {
    problem.value = (error as { data?: { detail?: string } }).data?.detail ?? 'That didn’t take — try again.'
  } finally {
    variantBusy.value = null
  }
}

// per-variant price edits with per-row state
const variantPrices = ref<Record<string, number>>({})
watch(product, (p) => {
  if (!p) return
  variantPrices.value = Object.fromEntries(p.variants.map((v) => [v.variant_id, v.price.amount]))
}, { immediate: true })
const variantSaved = ref<string | null>(null)
async function saveVariantPrice(variantId: string) {
  const target = product.value?.variants.find((v) => v.variant_id === variantId)
  const amount = variantPrices.value[variantId]
  if (!target || amount === undefined || amount === target.price.amount || variantBusy.value) return
  variantBusy.value = variantId
  try {
    await $fetch(`/api/v1/products/${productId.value}/variants/${variantId}`, {
      method: 'PATCH',
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
      body: { price: { amount, currency: target.price.currency } },
    })
    await refresh()
    variantSaved.value = variantId
    announce('Price saved.')
    setTimeout(() => { if (variantSaved.value === variantId) variantSaved.value = null }, 2000)
  } finally {
    variantBusy.value = null
  }
}

const { copiedId, copy } = useCopyFeedback()
const liveUrl = computed(() => (store.value ? `/s/${store.value.handle}/p/${productId.value}` : null))
function copyLive() {
  if (liveUrl.value) void copy('live', `${window.location.origin}${liveUrl.value}`)
}
const sortedMedia = computed(() => [...(product.value?.media ?? [])].sort((a, b) => a.position - b.position))
const currency = computed(() => product.value?.variants[0]?.price.currency ?? 'EUR')
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
    <template v-if="pending || !product">
      <h1 class="sr-only">Loading this product…</h1>
      <div class="flex flex-col gap-3" aria-hidden="true">
        <DofSkeleton v-for="n in 3" :key="n" class="h-20 rounded-large" />
      </div>
    </template>

    <template v-else>
      <PageHeader :title="product.title" subtitle="Everything about this product, in one place.">
        <template #meta>
          <div class="flex flex-wrap gap-2">
            <DofBadge v-if="product.status === 'archived'" tone="caution">Archived</DofBadge>
            <DofBadge v-else-if="onStore" tone="positive">● On your store</DofBadge>
            <DofBadge v-else tone="neutral">○ Not on your store</DofBadge>
            <DofBadge v-if="saveState === 'saving'" tone="neutral">Saving…</DofBadge>
            <DofBadge v-else-if="saveState === 'saved'" tone="positive">Saved ✓</DofBadge>
            <DofBadge v-else-if="dirty" tone="neutral">Unsaved changes</DofBadge>
          </div>
        </template>
        <template #actions>
          <NuxtLink v-if="onStore && liveUrl" :to="`${liveUrl}?v=${Date.now()}`" target="_blank" class="contents">
            <DofButton size="sm" tone="accent" icon="external-link">View live</DofButton>
          </NuxtLink>
          <DofButton v-if="onStore && liveUrl" size="sm" variant="soft" tone="neutral" icon="copy" @click="copyLive">
            {{ copiedId === 'live' ? 'Copied ✓' : 'Copy link' }}
          </DofButton>
        </template>
      </PageHeader>

      <!-- ——— details -->
      <section aria-label="details" class="flex flex-col gap-4">
        <DofInput v-model="title" label="Title" :maxlength="140" />
        <DofTextarea v-model="description" label="Description" hint="One honest paragraph beats a spec sheet." :rows="3" :maxlength="2000" />
        <DofInput
          :model-value="priceMinor === null ? '' : String(priceMinor / 100)"
          label="Price"
          :hint="`In ${currency} — change it anytime.`"
          inputmode="decimal"
          @update:model-value="(v: string) => { const n = Number(String(v).replace(',', '.')); priceMinor = Number.isFinite(n) && v !== '' ? Math.round(n * 100) : null }"
        />
        <DofProblem v-if="problem" title="Nothing was lost" :detail="problem" />
        <div class="flex items-center gap-3">
          <DofButton tone="accent" icon="check" :disabled="!dirty" :loading="saveState === 'saving'" @click="save">Save changes</DofButton>
        </div>
      </section>

      <!-- ——— media -->
      <section aria-label="photos" class="flex flex-col gap-3">
        <DofText role="emphasis" as="h2">Photos</DofText>
        <ul v-if="sortedMedia.length > 0" class="grid list-none grid-cols-3 gap-3 p-0 regular:grid-cols-4">
          <li v-for="(m, i) in sortedMedia" :key="m.product_media_id" class="flex flex-col gap-1">
            <PublicImg :src="m.url ?? ''" :alt="m.alt_text ?? product.title" img-class="aspect-square w-full rounded-medium object-cover" />
            <div class="flex items-center justify-between">
              <DofText v-if="m.role === 'hero'" role="caption" class="text-accent">Cover</DofText>
              <span v-else />
              <div class="flex gap-1">
                <DofButton size="sm" variant="ghost" tone="neutral" icon="arrow-left" :disabled="i === 0 || mediaBusy" aria-label="Move earlier" @click="movePhoto(m, -1)" />
                <DofButton size="sm" variant="ghost" tone="neutral" icon="arrow-right" :disabled="i === sortedMedia.length - 1 || mediaBusy" aria-label="Move later" @click="movePhoto(m, 1)" />
                <DofButton size="sm" variant="ghost" tone="neutral" icon="trash-2" :disabled="mediaBusy" aria-label="Remove photo" @click="removePhoto(m)" />
              </div>
            </div>
          </li>
        </ul>
        <label class="dof-interactive flex cursor-pointer items-center gap-2 self-start rounded-medium border border-dashed border-line px-4 py-3 text-body text-muted-foreground transition-colors hover:border-accent focus-within:focus-ring">
          <DofText role="body" tone="muted">{{ mediaBusy ? 'Uploading…' : sortedMedia.length === 0 ? 'Add the first photo' : 'Add another photo' }}</DofText>
          <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" :disabled="mediaBusy" @change="addPhoto">
        </label>
      </section>

      <!-- ——— sizes & colors (the composer's promise, kept here) -->
      <section v-if="product.status !== 'archived'" aria-label="sizes and colors" class="flex flex-col gap-3">
        <DofText role="emphasis" as="h2">Sizes &amp; colors</DofText>

        <!-- quiet disclosure, in the composer's exact voice -->
        <template v-if="product.options.length === 0">
          <button
            v-if="!showOptionForm"
            type="button"
            class="dof-interactive self-start rounded-small px-1 text-caption text-faint-foreground focus-visible:focus-ring"
            :aria-expanded="showOptionForm"
            @click="showOptionForm = true"
          >
            It comes in sizes or colors
          </button>
          <div v-else class="flex flex-col gap-3 rounded-large border border-line bg-surface-raised p-4">
            <DofInput v-model="optionName" label="What varies?" placeholder="Size" :maxlength="30" />
            <div class="flex flex-wrap gap-2">
              <DofChip v-for="sugg in OPTION_SUGGESTIONS" :key="sugg" :label="sugg" selectable :selected="optionName === sugg" @toggle="optionName = sugg" />
            </div>
            <DofInput v-model="optionValues" label="Which options?" hint="Comma-separated — your current setup becomes the first one." placeholder="S, M, L" />
            <div class="flex gap-2">
              <DofButton size="sm" tone="accent" :loading="optionBusy" @click="addOption">Add</DofButton>
              <DofButton size="sm" variant="ghost" tone="neutral" @click="showOptionForm = false">Not now</DofButton>
            </div>
          </div>
        </template>

        <template v-else>
          <DofText v-for="opt in product.options" :key="opt.name" role="caption" tone="muted">
            {{ opt.name }} — {{ opt.values.join(' · ') }}
          </DofText>

          <ul class="flex list-none flex-col gap-2 p-0">
            <li v-for="v in product.variants" :key="v.variant_id" class="flex flex-wrap items-center gap-3 rounded-medium border border-line p-3">
              <DofText role="body" class="min-w-24 flex-1 font-medium">{{ comboLabel(v.option_values) }}</DofText>
              <div class="flex items-center gap-2">
                <DofInput
                  :model-value="String((variantPrices[v.variant_id] ?? v.price.amount) / 100)"
                  :label="`Price for ${comboLabel(v.option_values)}`"
                  label-hidden
                  inputmode="decimal"
                  class="w-28"
                  @update:model-value="(val: string) => { const n = Number(String(val).replace(',', '.')); if (Number.isFinite(n)) variantPrices[v.variant_id] = Math.round(n * 100) }"
                />
                <DofButton
                  size="sm" variant="soft" tone="neutral"
                  :disabled="(variantPrices[v.variant_id] ?? v.price.amount) === v.price.amount"
                  :loading="variantBusy === v.variant_id"
                  @click="saveVariantPrice(v.variant_id)"
                >
                  {{ variantSaved === v.variant_id ? 'Saved ✓' : 'Save' }}
                </DofButton>
              </div>
            </li>
            <!-- ghosts: combinations that could exist — one tap makes them real -->
            <li v-for="combo in ghostCombos" :key="comboLabel(combo)" class="flex flex-wrap items-center gap-3 rounded-medium border border-dashed border-line p-3">
              <DofText role="body" class="min-w-24 flex-1 text-muted-foreground">{{ comboLabel(combo) }}</DofText>
              <DofButton size="sm" variant="ghost" tone="accent" icon="plus" :loading="variantBusy === JSON.stringify(combo)" @click="makeReal(combo)">
                Add {{ comboLabel(combo) }}
              </DofButton>
            </li>
          </ul>
        </template>
      </section>

      <!-- ——— publishing & lifecycle -->
      <section aria-label="publishing" class="flex flex-col gap-3">
        <DofText role="emphasis" as="h2">On your store</DofText>
        <div class="flex flex-wrap gap-2">
          <template v-if="product.status !== 'archived'">
            <DofButton v-if="!onStore" tone="accent" icon="store" :loading="busy === 'Put on your store'" @click="publish">Put on my store</DofButton>
            <DofButton v-else variant="soft" tone="neutral" icon="eye-off" :loading="busy === 'Hidden from your store'" @click="unpublish">Hide from my store</DofButton>
            <DofButton variant="soft" tone="neutral" icon="copy" :loading="busy === 'duplicate'" @click="duplicate">Duplicate</DofButton>
            <DofButton :variant="armedId === 'archive' ? 'soft' : 'ghost'" :tone="armedId === 'archive' ? 'critical' : 'neutral'" icon="archive" @click="armOrArchive">
              {{ armedId === 'archive' ? 'Really archive?' : 'Archive' }}
            </DofButton>
          </template>
          <template v-else>
            <DofButton tone="accent" icon="archive-restore" :loading="busy === 'Restored'" @click="restore">Restore product</DofButton>
            <DofText role="caption" tone="muted" class="self-center">Archived products are hidden everywhere and keep their history.</DofText>
          </template>
        </div>
      </section>

      <!-- honest placeholders: named, dated intentions — not broken promises -->
      <section class="flex flex-col gap-2">
        <DofText role="caption" tone="muted">Scheduled publication, SEO fields, and change history arrive with their capabilities — this page is where they will live.</DofText>
        <NuxtLink to="/products" class="dof-interactive self-start rounded-small px-1 text-caption text-foreground/70 underline-offset-4 hover:underline focus-visible:focus-ring">← Back to all products</NuxtLink>
      </section>
    </template>
  </div>
</template>
