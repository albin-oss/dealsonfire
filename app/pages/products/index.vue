<script setup lang="ts">
/**
 * /products — the Product Composer (Vertical Slice 003, UX-AUTHOR-001/002). Not a form:
 * a mirror. One conversational line ("Lavender baby blanket, 45"), inferred proposals as
 * tappable chips (advisory — ignoring them all still publishes), the photo slot over the
 * Media Port, on-demand variants, and the Readiness voice (confidence, not completeness).
 * Persona refinements (PROMPT-024): SKU disclosure for retailers, service price framing,
 * honest digital-delivery note, variant price transparency. Publish reuses the frozen
 * Catalog API — zero business logic here.
 */
import { computed, onMounted, ref, watch } from 'vue'
import {
  DofText, DofButton, DofInput, DofTextarea, DofMoneyInput, DofChip,
  DofMediaSlot, DofReadinessSummary, DofEmptyState, DofSkeleton, DofMoney, DofProblem,
  announce, type SlotMedia,
} from '@ds/index'
import { parseLine, inferKind, suggestCategory, draftDescription, type AuthoringKind } from '../../composables/authoring-intelligence'
import { productReadiness } from '../../composables/product-readiness'
import { useCopyFeedback } from '../../composables/use-copy'
import { useDevHeaders } from '../../composables/dev-headers'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Products — DOF' })

// ——— workspace context: the business this composer authors into
const headers = useDevHeaders()
const { data: workspace } = useFetch<{ businesses: Array<{ business_id: string; stores: Array<{ store_id: string; handle: string }> }> }>('/api/v1/workspace', {
  lazy: true, server: false, headers,
})
const businessId = computed(() => workspace.value?.businesses[0]?.business_id ?? null)
const storeId = computed(() => workspace.value?.businesses[0]?.stores[0]?.store_id ?? null)
const storeHandle = computed(() => workspace.value?.businesses[0]?.stores[0]?.handle ?? null)

// ——— the grid
interface GridRow { id: string; title: string; status: string; updated_at: string; min_price_amount: number | null; price_currency: string | null; on_store: boolean; image_url: string | null; image_alt: string | null }
// ——— managing the shelf (Capability 01): search is a server filter (q), archived is
// an explicit opt-in, sort and shelf-filters are client-side over the loaded page
const search = ref('')
const searchDebounced = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, (v) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => (searchDebounced.value = v.trim()), 250)
})
type ShelfFilter = 'all' | 'on_store' | 'hidden' | 'archived'
const shelfFilter = ref<ShelfFilter>('all')
type ShelfSort = 'newest' | 'title' | 'price'
const shelfSort = ref<ShelfSort>('newest')

const { data: grid, refresh: refreshGrid, pending: gridPending } = useFetch<{ items: GridRow[] }>(
  () => `/api/v1/products?business_id=${businessId.value}&limit=100${storeId.value ? `&channel_id=${storeId.value}` : ''}${searchDebounced.value ? `&q=${encodeURIComponent(searchDebounced.value)}` : ''}${shelfFilter.value === 'archived' ? '&show_archived=true&status=archived' : ''}`,
  { lazy: true, server: false, headers, immediate: false, watch: [searchDebounced, shelfFilter] },
)
watch(businessId, (id) => { if (id) void refreshGrid() }, { immediate: true })

const shelf = computed(() => {
  let items = grid.value?.items ?? []
  if (shelfFilter.value === 'on_store') items = items.filter((p) => p.on_store)
  if (shelfFilter.value === 'hidden') items = items.filter((p) => !p.on_store && p.status !== 'archived')
  const sorted = [...items]
  if (shelfSort.value === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title))
  else if (shelfSort.value === 'price') sorted.sort((a, b) => (a.min_price_amount ?? 0) - (b.min_price_amount ?? 0))
  else sorted.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  return sorted
})

// ——— bulk operations: select, then act with existing per-product endpoints
const selecting = ref(false)
const selected = ref<Set<string>>(new Set())
function toggleSelect(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
const bulkBusy = ref(false)
async function bulkAct(kind: 'publish' | 'unpublish' | 'archive') {
  if (bulkBusy.value || selected.value.size === 0 || !storeId.value || !businessId.value) return
  bulkBusy.value = true
  let done = 0
  try {
    for (const id of selected.value) {
      const path = kind === 'archive'
        ? `/api/v1/products/${id}/archive`
        : `/api/v1/products/${id}/${kind === 'publish' ? 'publish-to-store' : 'unpublish-from-store'}`
      await $fetch(path, {
        method: 'POST',
        headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
        ...(kind !== 'archive' ? { body: { store_id: storeId.value } } : {}),
      }).then(() => { done += 1 }).catch(() => { /* per-item failure: count stays honest */ })
    }
    announce(`${done} of ${selected.value.size} products ${kind === 'publish' ? 'put on your store' : kind === 'unpublish' ? 'hidden' : 'archived'}.`)
    selected.value = new Set()
    selecting.value = false
    await refreshGrid()
  } finally {
    bulkBusy.value = false
  }
}

// ——— the composer state (autosaved locally — work is never lost)
const DRAFT_KEY = 'dof.product-composer'
const line = ref('')
const priceMinor = ref<number | null>(null) // dedicated field, only when the line has no price
const kindOverride = ref<AuthoringKind | null>(null)
const categoryAccepted = ref(false)
const descriptionText = ref('')
const descriptionAccepted = ref(false)
const media = ref<SlotMedia | null>(null)
const sku = ref('')
const showSku = ref(false)
const showVariants = ref(false)
const optionName = ref('')
const optionValues = ref('')

// Draft restore happens AFTER hydration — restoring during client setup would make
// the first client render diverge from the server HTML (hydration mismatch).
onMounted(() => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? 'null')
    if (saved) { line.value = saved.line ?? ''; priceMinor.value = saved.priceMinor ?? null }
  } catch { /* fresh start */ }
  watch([line, priceMinor], () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ line: line.value, priceMinor: priceMinor.value }))
  })
})

// ——— inference (advisory; every proposal is a tap away from accepted — or ignored)
const parsed = computed(() => parseLine(line.value))
const effectivePrice = computed(() => parsed.value.priceMinor ?? priceMinor.value)
const kind = computed<AuthoringKind>(() => kindOverride.value ?? inferKind(parsed.value.title))
const KINDS: AuthoringKind[] = ['physical', 'digital', 'service']
const KIND_LABEL: Record<AuthoringKind, string> = { physical: 'You ship it', digital: 'Instant download', service: 'You provide it' }
function cycleKind() {
  const next = KINDS[(KINDS.indexOf(kind.value) + 1) % KINDS.length]!
  kindOverride.value = next
  announce(`Kind: ${KIND_LABEL[next]}`)
}
const category = computed(() => suggestCategory(parsed.value.title))
const draft = computed(() => draftDescription(parsed.value.title, kind.value))
function acceptDescription() {
  descriptionText.value = draft.value ?? ''
  descriptionAccepted.value = true
}

const parseEcho = computed(() => {
  if (!parsed.value.title) return ''
  const bits = [`Title: ${parsed.value.title}`]
  if (parsed.value.priceMinor) bits.push(`Price: €${(parsed.value.priceMinor / 100).toFixed(2)}`)
  return bits.join(' · ')
})

// ——— variants (on demand; transparency over configuration)
const variantValues = computed(() =>
  optionValues.value.split(',').map((v) => v.trim()).filter(Boolean).slice(0, 20))
const variantSummary = computed(() => {
  if (!showVariants.value || variantValues.value.length < 2 || effectivePrice.value === null) return ''
  return `${variantValues.value.length} variants, all at €${(effectivePrice.value / 100).toFixed(2)} — you can adjust each later.`
})

// ——— readiness (the confidence voice)
const readiness = computed(() => productReadiness({
  title: parsed.value.title,
  priceMinor: effectivePrice.value,
  kind: kind.value,
  categoryAccepted: categoryAccepted.value,
  descriptionAccepted: descriptionAccepted.value,
  mediaCount: media.value ? 1 : 0,
}))

// ——— media upload through the port
async function uploadMedia(file: File): Promise<{ mediaId: string; url: string }> {
  const body = new FormData()
  body.append('file', file)
  body.append('business_id', businessId.value ?? '')
  const res = await $fetch<{ media_id: string; url: string }>('/api/v1/media', { method: 'POST', body, headers })
  return { mediaId: res.media_id, url: res.url }
}

// ——— publish (the frozen Catalog API; no business logic here)
const publishing = ref(false)
const publishProblem = ref('')
async function publish() {
  if (!businessId.value || !readiness.value.publishable) return
  publishing.value = true
  publishProblem.value = ''
  try {
    const created = await $fetch<{ product_id: string }>('/api/v1/products', {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
      body: {
        business_id: businessId.value,
        // "Put it on the shelf" means it: same-transaction publication (VISIBILITY_CONTRACT §6)
        ...(storeId.value ? { publish_to_store_id: storeId.value } : {}),
        title: parsed.value.title,
        fulfillment_kind: kind.value,
        default_price: { amount: effectivePrice.value, currency: 'EUR' },
        ...(categoryAccepted.value && category.value ? { category_path: category.value } : {}),
        ...(descriptionAccepted.value && descriptionText.value.trim()
          ? { description: { format: 'plain', content: descriptionText.value.trim() } } : {}),
        ...(showVariants.value && variantValues.value.length >= 2 && optionName.value.trim()
          ? {
              options: [{ name: optionName.value.trim(), values: variantValues.value }],
              variants: variantValues.value.map((v) => ({
                option_values: { [optionName.value.trim()]: v },
                price: { amount: effectivePrice.value, currency: 'EUR' },
                ...(sku.value.trim() ? { sku: `${sku.value.trim()}-${v}`.slice(0, 60) } : {}),
              })),
            }
          : sku.value.trim()
            ? { variants: [{ option_values: {}, price: { amount: effectivePrice.value, currency: 'EUR' }, sku: sku.value.trim() }] }
            : {}),
        ...(media.value ? { media: [{ media_id: media.value.mediaId, alt_text: media.value.alt || parsed.value.title }] } : {}),
      },
    })
    justPublished.value = storeId.value && storeHandle.value
      ? { title: parsed.value.title, productId: created.product_id }
      : null
    announce(`“${parsed.value.title}” is on your store.`)
    resetComposer()
    await refreshGrid()
  } catch (error) {
    publishProblem.value = (error as { data?: { detail?: string } }).data?.detail ?? 'We couldn’t save that just now — everything you typed is safe; try again.'
  } finally {
    publishing.value = false
  }
}

// ——— the View-live flow (Release 0.2): publish → see it → copy it → share it. No modal.
const justPublished = ref<{ title: string; productId: string } | null>(null)
const productUrl = (id: string) => `/s/${storeHandle.value}/p/${id}`
const { copiedId, copy } = useCopyFeedback()
const copyProductLink = (id: string) => copy(id, `${window.location.origin}${productUrl(id)}`)

// ——— on/off the store: instantly reversible intent, never a confirmation dialog
const toggling = ref<string | null>(null)
async function toggleOnStore(row: GridRow) {
  if (!storeId.value || toggling.value) return
  toggling.value = row.id
  try {
    const action = row.on_store ? 'unpublish-from-store' : 'publish-to-store'
    await $fetch(`/api/v1/products/${row.id}/${action}`, {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
      body: { store_id: storeId.value },
    })
    announce(row.on_store ? `“${row.title}” is off your store — tap again to bring it back.` : `“${row.title}” is on your store.`)
    await refreshGrid()
  } catch (error) {
    announce((error as { data?: { detail?: string } }).data?.detail ?? 'That didn’t take — try again.')
  } finally {
    toggling.value = null
  }
}

function resetComposer() {
  line.value = ''; priceMinor.value = null; kindOverride.value = null
  categoryAccepted.value = false; descriptionAccepted.value = false; descriptionText.value = ''
  media.value = null; sku.value = ''; showSku.value = false
  showVariants.value = false; optionName.value = ''; optionValues.value = ''
  if (import.meta.client) window.localStorage.removeItem(DRAFT_KEY)
}
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
    <PageHeader title="Products" subtitle="One line is enough — DOF drafts the rest, you approve." />

    <!-- ——— the Composer -->
    <section aria-label="add a product" class="flex flex-col gap-4 rounded-large border border-line bg-surface-raised p-5">
      <DofInput
        v-model="line"
        label="What are you selling?"
        placeholder="Lavender baby blanket, 45"
        description="Type it like you'd say it — add the price right in the line if you like."
      />
      <DofText v-if="parseEcho" role="caption" tone="muted" aria-live="polite">{{ parseEcho }}</DofText>

      <DofMoneyInput
        v-if="parsed.title && parsed.priceMinor === null"
        v-model="priceMinor"
        label="Starting price"
        currency="EUR"
        description="Price is yours — start where it feels fair, change it anytime."
      />

      <!-- inferred proposals: tappable, advisory, never applied on their own -->
      <div v-if="parsed.title" class="flex flex-wrap gap-2" aria-label="suggestions">
        <DofChip :label="`Kind: ${KIND_LABEL[kind]}`" selectable :selected="kindOverride !== null" @toggle="cycleKind()" />
        <DofChip
          v-if="category"
          :label="`Category: ${category}`"
          selectable
          :selected="categoryAccepted"
          @toggle="categoryAccepted = !categoryAccepted"
        />
        <DofChip
          v-if="draft && !descriptionAccepted"
          :label="`Describe it: “${draft.slice(0, 40)}…”`"
          selectable
          :selected="false"
          @toggle="acceptDescription()"
        />
      </div>
      <DofTextarea
        v-if="descriptionAccepted"
        v-model="descriptionText"
        label="Description"
        :rows="2"
      />

      <DofMediaSlot v-if="parsed.title && businessId" v-model="media" :upload="uploadMedia" />

      <!-- quiet disclosures: complexity only for those who ask -->
      <div v-if="parsed.title" class="flex flex-wrap gap-4">
        <button type="button" class="dof-interactive rounded-small px-1 text-caption text-faint-foreground focus-visible:focus-ring" :aria-expanded="showVariants" @click="showVariants = !showVariants">
          {{ showVariants ? 'No sizes or colors after all' : 'It comes in sizes or colors' }}
        </button>
        <button type="button" class="dof-interactive rounded-small px-1 text-caption text-faint-foreground focus-visible:focus-ring" :aria-expanded="showSku" @click="showSku = !showSku">
          {{ showSku ? 'Skip the SKU' : 'I have a SKU or barcode' }}
        </button>
      </div>
      <div v-if="showVariants" class="flex flex-col gap-3">
        <DofInput v-model="optionName" label="What varies?" placeholder="Size" />
        <DofInput v-model="optionValues" label="The choices, comma-separated" placeholder="S, M, L" />
        <DofText v-if="variantSummary" role="caption" tone="muted" aria-live="polite">{{ variantSummary }}</DofText>
      </div>
      <DofInput v-if="showSku" v-model="sku" label="SKU or barcode" placeholder="BLK-LAV-01" />

      <!-- the confidence voice + the commitment -->
      <DofReadinessSummary v-if="parsed.title" title="Ready to publish" :items="readiness.items" />
      <DofProblem v-if="publishProblem" title="Nothing was lost" :detail="publishProblem" />
      <div class="flex items-center gap-3">
        <DofButton tone="accent" size="lg" :loading="publishing" :disabled="!readiness.publishable || !businessId" @click="publish()">
          Put it on the shelf
        </DofButton>
        <DofText v-if="workspace && !businessId" role="caption" tone="muted">
          Create your business first — <NuxtLink to="/ignite" class="underline">Ignite takes four minutes</NuxtLink>.
        </DofText>
      </div>
    </section>

    <!-- ——— just published: View Live → Copy Link → Share (Release 0.2, no modal) -->
    <PublishedBar v-if="justPublished && storeHandle" :live-url="productUrl(justPublished.productId)" @dismiss="justPublished = null">
      <strong>“{{ justPublished.title }}”</strong> is on your store.
    </PublishedBar>

    <!-- ——— the shelf -->
    <section aria-label="your products" class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <DofText role="emphasis" as="h2">On the shelf</DofText>
        <DofButton size="sm" variant="ghost" tone="neutral" @click="selecting = !selecting; selected = new Set()">
          {{ selecting ? 'Done selecting' : 'Select' }}
        </DofButton>
      </div>

      <!-- manage: search · filter · sort (Capability 01) -->
      <div class="flex flex-wrap items-center gap-2">
        <DofInput v-model="search" label="Search your products" placeholder="Search by title…" class="min-w-48 flex-1" />
      </div>
      <div class="flex flex-wrap items-center gap-2" role="group" aria-label="filter the shelf">
        <DofChip v-for="f in ([['all','All'],['on_store','On your store'],['hidden','Hidden'],['archived','Archived']] as const)" :key="f[0]"
          :label="f[1]" :selected="shelfFilter === f[0]" selectable @toggle="shelfFilter = f[0]" />
        <span class="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        <DofChip v-for="o in ([['newest','Newest'],['title','A–Z'],['price','Price']] as const)" :key="o[0]"
          :label="o[1]" :selected="shelfSort === o[0]" selectable @toggle="shelfSort = o[0]" />
      </div>

      <!-- bulk bar -->
      <div v-if="selecting && selected.size > 0" class="flex flex-wrap items-center gap-2 rounded-large border border-accent/30 bg-accent/5 p-3" aria-live="polite">
        <DofText role="body" class="flex-1">{{ selected.size }} selected</DofText>
        <DofButton size="sm" tone="accent" icon="store" :loading="bulkBusy" @click="bulkAct('publish')">Put on store</DofButton>
        <DofButton size="sm" variant="soft" tone="neutral" icon="eye-off" :loading="bulkBusy" @click="bulkAct('unpublish')">Hide</DofButton>
        <DofButton size="sm" variant="soft" tone="neutral" icon="archive" :loading="bulkBusy" @click="bulkAct('archive')">Archive</DofButton>
      </div>

      <div v-if="gridPending && businessId && shelf.length === 0" class="grid grid-cols-2 gap-3 regular:grid-cols-3" aria-hidden="true">
        <DofSkeleton v-for="n in 3" :key="n" class="h-24 rounded-large" />
      </div>
      <ul v-else-if="shelf.length > 0" :class="gridPending && 'opacity-60'" class="grid list-none grid-cols-2 gap-3 p-0 transition-opacity tempo-quick regular:grid-cols-3">
        <li v-for="p in shelf" :key="p.id" class="relative flex flex-col gap-1.5 rounded-large border p-3" :class="selected.has(p.id) ? 'border-accent bg-accent/5' : 'border-line'">
          <button
            v-if="selecting"
            type="button"
            class="dof-interactive absolute inset-0 layer-base rounded-large focus-visible:focus-ring"
            :aria-pressed="selected.has(p.id)"
            :aria-label="`${selected.has(p.id) ? 'Deselect' : 'Select'} ${p.title}`"
            @click="toggleSelect(p.id)"
          />
          <NuxtLink :to="`/products/${p.id}`" class="dof-interactive block rounded-medium focus-visible:focus-ring">
            <PublicImg v-if="p.image_url" :src="p.image_url" :alt="p.image_alt ?? p.title" img-class="h-20 w-full rounded-medium object-cover" />
            <div v-else class="flex h-20 items-center justify-center rounded-medium bg-accent/10 text-caption text-foreground/50" aria-hidden="true">no photo yet</div>
          </NuxtLink>
          <DofText role="body" class="truncate font-medium">{{ p.title }}</DofText>
          <DofMoney v-if="p.min_price_amount" :amount="p.min_price_amount" :currency="p.price_currency ?? 'EUR'" class="text-caption text-muted-foreground" />
          <DofText role="caption" :tone="p.on_store ? undefined : 'muted'" :class="p.on_store && 'text-positive'">
            {{ p.on_store ? '● On your store' : '○ Not on your store' }}
          </DofText>
          <div class="mt-0.5 flex flex-wrap items-center gap-1.5">
            <DofButton size="sm" :variant="p.on_store ? 'ghost' : 'soft'" :tone="p.on_store ? 'neutral' : 'accent'"
                       :loading="toggling === p.id" @click="toggleOnStore(p)">
              {{ p.on_store ? 'Hide from my store' : 'Put on my store' }}
            </DofButton>
            <template v-if="p.on_store && storeHandle">
              <NuxtLink :to="`${productUrl(p.id)}?v=${Date.now()}`" target="_blank" class="contents">
                <DofButton size="sm" variant="ghost" tone="neutral" icon="external-link">View live</DofButton>
              </NuxtLink>
              <DofButton size="sm" variant="ghost" tone="neutral" icon="copy" @click="copyProductLink(p.id)">{{ copiedId === p.id ? "Copied ✓" : "Copy link" }}</DofButton>
            </template>
          </div>
        </li>
      </ul>
      <DofEmptyState
        v-else-if="searchDebounced || shelfFilter !== 'all'"
        icon="search"
        title="Nothing matches"
        why="Try a different search or filter — nothing has been lost."
      />
      <DofEmptyState
        v-else
        icon="package"
        title="Your first product goes here"
        why="One line above is all it takes — the shelf fills as you do."
      />
    </section>
  </div>
</template>
