<script setup lang="ts">
/**
 * /store — Store Identity (Release 0.5). The coming-soon stub becomes the journey the
 * workspace has pointed at since day one ("share-store" lands here): see your store as
 * customers see it, and say who you are — tagline, story, promise. Drafts are advisory
 * (the authoring-intelligence idiom): AI suggests, the merchant decides. Saving is the
 * existing whole-value Brand Kit PUT — no new write paths.
 */
import { computed, reactive, ref, watch } from 'vue'
import {
  DofText, DofButton, DofInput, DofTextarea, DofChip,
  DofEmptyState, DofSkeleton, DofProblem, DofMediaSlot, type SlotMedia,
  announce, useBrandKit,
} from '@ds/index'
import type { BrandKitResponse } from '@contracts/schemas/merchant/brand-kit.schema'
import { draftStory, draftPromises } from '../composables/identity-intelligence'
import { useDevHeaders } from '../composables/dev-headers'
import { useCopyFeedback } from '../composables/use-copy'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Your store — DOF' })

// ——— workspace context (the same spine as Products and Deals)
const headers = useDevHeaders()
const { data: workspace, refresh: refreshWorkspace } = useFetch<{ businesses: Array<{ business_id: string; stores: Array<{ store_id: string; handle: string; name: string; status: string }> }> }>('/api/v1/workspace', {
  lazy: true, server: false, headers,
})
const businessId = computed(() => workspace.value?.businesses[0]?.business_id ?? null)
const store = computed(() => workspace.value?.businesses[0]?.stores[0] ?? null)
const storeUrl = computed(() => (store.value ? `/s/${store.value.handle}` : null))

// SV-1: the maker controls whether the store is open. The status header reads the
// public state in plain words and offers ONE primary action; Close is behind a
// deliberate confirmation (progressive disclosure), never a bare button.
type StoreStatus = 'draft' | 'live' | 'paused' | 'closed' | 'archived' | 'deleted'
const lifecycle = reactive({ busy: false, confirmClose: false, restoreDaysLeft: null as number | null, error: '' })
const statusView = computed<{ label: string; tone: string; meaning: string } | null>(() => {
  switch (store.value?.status as StoreStatus | undefined) {
    case 'live': return { label: 'Open', tone: 'positive', meaning: 'People can find and buy from your store.' }
    case 'paused': return { label: 'Paused', tone: 'caution', meaning: 'Your store is hidden from buyers for now. You can reopen it anytime.' }
    case 'closed': return { label: 'Closed', tone: 'neutral', meaning: lifecycle.restoreDaysLeft != null
      ? `You closed your store. You can still restore it for ${lifecycle.restoreDaysLeft} more ${lifecycle.restoreDaysLeft === 1 ? 'day' : 'days'}.`
      : 'You closed your store.' }
    case 'draft': return { label: 'Not open yet', tone: 'neutral', meaning: 'Your store isn’t open to buyers yet.' }
    default: return null
  }
})

async function lifecycleAction(path: string, body: Record<string, unknown> = {}) {
  if (!store.value || lifecycle.busy) return
  lifecycle.busy = true; lifecycle.error = ''
  try {
    const res = await $fetch<{ status: string; restore_days_left?: number | null }>(
      `/api/v1/stores/${store.value.store_id}/${path}`, { method: "POST", body, headers })
    if (typeof res.restore_days_left !== 'undefined') lifecycle.restoreDaysLeft = res.restore_days_left
    lifecycle.confirmClose = false
    await refreshWorkspace()
    announce(`Your store is now ${res.status === 'live' ? 'open' : res.status}.`)
  } catch (e) {
    lifecycle.error = (e as { data?: { detail?: string } }).data?.detail ?? 'That didn’t work — please try again.'
  } finally { lifecycle.busy = false }
}
const pauseStore = () => lifecycleAction('pause', { reason: 'other' })
const reopenStore = () => lifecycleAction('publish')
const closeStore = () => lifecycleAction('close')
const restoreStore = () => lifecycleAction('restore')

// ——— the shelf (context for honest drafts)
interface GridRow { id: string; title: string; on_store: boolean }
const { data: grid, refresh: refreshGrid } = useFetch<{ items: GridRow[] }>(
  () => `/api/v1/products?business_id=${businessId.value}&limit=24${store.value ? `&channel_id=${store.value.store_id}` : ''}`,
  { lazy: true, server: false, headers, immediate: false },
)

// ——— the identity (Brand Kit voice)
const kit = ref<BrandKitResponse | null>(null)
const loadingKit = ref(false)
const IDENTITY_DRAFT_KEY = 'dof.identity-draft'
const draftRestored = ref(false)
const tagline = ref('')
const story = ref('')
const promise = ref('')
// SV-2: the shaping fields — display name, one brand accent, and a logo. All ride the
// same whole-value Brand Kit PUT (no new write path); the handle is its own consequential
// flow below. The accent is constrained to a single hex; DOF owns the rest of the grammar.
const displayName = ref('')
const accent = ref('') // the store's brand accent (hex); every store has one from creation
const logo = ref<SlotMedia | null>(null)

async function uploadMedia(file: File): Promise<{ mediaId: string; url: string }> {
  const form = new FormData()
  form.append('file', file)
  form.append('business_id', businessId.value ?? '')
  const res = await $fetch<{ media_id: string; url: string }>('/api/v1/media', { method: 'POST', body: form, headers })
  return { mediaId: res.media_id, url: res.url }
}

async function loadKit() {
  if (!store.value) return
  loadingKit.value = true
  try {
    kit.value = await $fetch<BrandKitResponse>(`/api/v1/stores/${store.value.store_id}/brand-kit`, { headers })
    tagline.value = kit.value.voice.tone ?? ''
    story.value = kit.value.voice.story ?? ''
    promise.value = kit.value.voice.promise ?? ''
    displayName.value = kit.value.name ?? store.value.name
    accent.value = kit.value.palette.primary ?? ''
    logo.value = kit.value.logo_media_id && kit.value.logo_url
      ? { mediaId: kit.value.logo_media_id, url: kit.value.logo_url, alt: `${kit.value.name} logo` }
      : null
  } catch { /* the editor teaches from blank */ } finally {
    loadingKit.value = false
    // the workspace promise: nothing you start is ever lost — an unsaved draft
    // from a previous visit comes back (post-hydration, post-load)
    try {
      const draft = JSON.parse(window.localStorage.getItem(IDENTITY_DRAFT_KEY) ?? 'null')
      if (draft && (draft.tagline !== (kit.value?.voice.tone ?? '') || draft.story !== (kit.value?.voice.story ?? '') || draft.promise !== (kit.value?.voice.promise ?? ''))) {
        tagline.value = draft.tagline ?? tagline.value
        story.value = draft.story ?? story.value
        promise.value = draft.promise ?? promise.value
        draftRestored.value = true
        announce('Restored your unsaved words.')
      }
    } catch { /* fresh start */ }
    watch([tagline, story, promise], () => {
      window.localStorage.setItem(IDENTITY_DRAFT_KEY, JSON.stringify({
        tagline: tagline.value, story: story.value, promise: promise.value,
      }))
    })
  }
}
watch(businessId, (id) => { if (id) { void refreshGrid(); void loadKit() } }, { immediate: true })

// ——— advisory drafts (AI suggests, the merchant decides)
const identityCtx = computed(() => ({
  storeName: store.value?.name ?? '',
  tagline: tagline.value.trim() || null,
  productTitles: (grid.value?.items ?? []).filter((p) => p.on_store).map((p) => p.title),
}))
const storyDraft = computed(() => (story.value.trim() ? null : draftStory(identityCtx.value)))
const promiseDrafts = computed(() => (promise.value.trim() ? [] : draftPromises(identityCtx.value)))

// ——— save: the existing whole-value Brand Kit PUT
const saving = ref(false)
const problem = ref('')
const savedAt = ref<number | null>(null)
const dirty = computed(() =>
  kit.value !== null && (
    tagline.value.trim() !== (kit.value.voice.tone ?? '') ||
    story.value.trim() !== (kit.value.voice.story ?? '') ||
    promise.value.trim() !== (kit.value.voice.promise ?? '') ||
    displayName.value.trim() !== kit.value.name ||
    accent.value.toLowerCase() !== (kit.value.palette.primary ?? '').toLowerCase() ||
    (logo.value?.mediaId ?? null) !== (kit.value.logo_media_id ?? null)
  ))

async function save() {
  if (!store.value || !kit.value || saving.value) return
  saving.value = true
  problem.value = ''
  try {
    const res = await $fetch<BrandKitResponse>(`/api/v1/stores/${store.value.store_id}/brand-kit`, {
      method: 'PUT',
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
      body: {
        name: displayName.value.trim() || kit.value.name,
        logo_media_id: logo.value?.mediaId ?? null,
        palette: { ...kit.value.palette, ...(accent.value ? { primary: accent.value.toLowerCase() } : {}) },
        typography: kit.value.typography,
        voice: {
          ...(tagline.value.trim() ? { tone: tagline.value.trim() } : {}),
          ...(story.value.trim() ? { story: story.value.trim() } : {}),
          ...(promise.value.trim() ? { promise: promise.value.trim() } : {}),
        },
      },
    })
    kit.value = res
    savedAt.value = Date.now()
    draftRestored.value = false
    window.localStorage.removeItem(IDENTITY_DRAFT_KEY)
    announce('Saved — your store now says who you are.')
  } catch (error) {
    problem.value = (error as { data?: { detail?: string } }).data?.detail ?? 'That didn’t take — nothing was lost; try again.'
  } finally {
    saving.value = false
  }
}

const { copiedId, copy } = useCopyFeedback()
// the preview wears the store's real palette — the same brand-kit idiom the live
// storefront uses, so what the merchant sees here IS what the street sees
const { scopeAttrs: previewAttrs } = useBrandKit(computed(() => ({
  accent: accent.value || kit.value?.palette.primary,
  accentStrong: accent.value || kit.value?.palette.primary,
})))

// the audience line (same read the sparks page uses)
const { data: progressData } = useFetch<{ momentum: { followers: number } | null }>('/api/v1/workspace/progress', {
  lazy: true, server: false, headers,
})
const followers = computed(() => progressData.value?.momentum?.followers ?? 0)

// ——— shipping summary (SV-3: /shipping owns the editor; /store keeps a door to the same
// truth). We read the public terms only to show a one-line promise + the derived returns law.
const shipSummary = ref('')
watch(store, async (s) => {
  if (!s) return
  try {
    const terms = await $fetch<{ handling_days: number; flat_rate_minor: number; free_over_minor: number | null; pickup_enabled: boolean; return_window_days: number }>(
      `/api/v1/public/stores/${s.handle}/shipping`)
    returnWindowDays.value = terms.return_window_days
    const rate = terms.flat_rate_minor === 0 ? 'Free shipping' : `€${(terms.flat_rate_minor / 100).toFixed(2)} shipping`
    shipSummary.value = `${rate} · ships within ${terms.handling_days} ${terms.handling_days === 1 ? 'day' : 'days'}${terms.pickup_enabled ? ' · pickup available' : ''}`
  } catch { /* defaults stand */ }
}, { immediate: true })

function copyStoreLink() {
  if (storeUrl.value) void copy('store', `${window.location.origin}${storeUrl.value}`)
}

// ——— SV-2: change your address on DOF. Consequential (owner + step-up): old links keep
// working (they redirect), the new handle can't be a reserved word or one already taken,
// and nobody can ever claim your old address. Availability is checked live as they type.
const handleEdit = reactive({
  open: false, value: '', checking: false,
  available: null as boolean | null, reason: '' as string, suggestions: [] as string[],
  busy: false, error: '',
})
let handleCheckTimer: ReturnType<typeof setTimeout> | null = null
function onHandleInput() {
  handleEdit.error = ''
  handleEdit.available = null
  const candidate = handleEdit.value.trim().toLowerCase()
  if (handleCheckTimer) clearTimeout(handleCheckTimer)
  if (!candidate || candidate === store.value?.handle) return
  handleEdit.checking = true
  handleCheckTimer = setTimeout(async () => {
    try {
      const res = await $fetch<{ available: boolean; reason: string; suggestions: string[] }>(
        `/api/v1/handles/${encodeURIComponent(candidate)}/availability`, { headers })
      handleEdit.available = res.available
      handleEdit.reason = res.reason
      handleEdit.suggestions = res.suggestions
    } catch { /* availability is advisory; the claim is authoritative */ } finally {
      handleEdit.checking = false
    }
  }, 350)
}
async function submitHandle() {
  const candidate = handleEdit.value.trim().toLowerCase()
  if (!store.value || handleEdit.busy || !candidate || candidate === store.value.handle) return
  handleEdit.busy = true; handleEdit.error = ''
  try {
    // dev-identity step-up is the x-dof-step-up header; session mode does the real ceremony.
    await $fetch<{ handle: string }>(`/api/v1/stores/${store.value.store_id}/handle`, {
      method: 'POST',
      headers: { ...headers, 'x-dof-step-up': 'true', 'idempotency-key': crypto.randomUUID() },
      body: { handle: candidate },
    })
    await refreshWorkspace()
    handleEdit.open = false; handleEdit.value = ''; handleEdit.available = null
    announce('Your store’s address is updated — your old links still work.')
  } catch (e) {
    handleEdit.error = (e as { data?: { detail?: string } }).data?.detail ?? 'That didn’t work — your address is unchanged.'
  } finally { handleEdit.busy = false }
}

// ——— SV-2: policies as truth, not theater — the returns promise is DOF's platform
// standard (never merchant free-text), shown so the merchant knows what buyers are told.
const returnWindowDays = ref<number | null>(null)
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
    <PageHeader title="Your store" subtitle="People buy from people — tell them who you are.">
      <template v-if="storeUrl && store?.status === 'live'" #actions>
        <NuxtLink :to="`${storeUrl}?v=${Date.now()}`" target="_blank" class="contents">
          <DofButton size="sm" tone="accent" icon="external-link">View live</DofButton>
        </NuxtLink>
        <DofButton size="sm" variant="soft" tone="neutral" icon="copy" @click="copyStoreLink">{{ copiedId === 'store' ? 'Copied ✓' : 'Copy link' }}</DofButton>
      </template>
    </PageHeader>

    <DofEmptyState
      v-if="workspace && !store"
      icon="store"
      title="Your store goes here"
      why="Ignite opens the doors in about four minutes — then this page is where it learns to speak."
    >
      <NuxtLink to="/ignite" class="contents"><DofButton tone="accent">Start Ignite</DofButton></NuxtLink>
    </DofEmptyState>

    <template v-else-if="store">
      <!-- SV-1: the maker controls whether the store is open -->
      <section v-if="statusView" aria-label="store status" class="flex flex-col gap-3 rounded-large border border-line p-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex flex-col gap-0.5">
            <div class="flex items-center gap-2">
              <span class="size-2 rounded-full" :class="{ 'bg-positive': statusView.tone === 'positive', 'bg-caution': statusView.tone === 'caution', 'bg-foreground/40': statusView.tone === 'neutral' }" aria-hidden="true" />
              <DofText role="emphasis" as="h2">Your store is {{ statusView.label.toLowerCase() }}</DofText>
            </div>
            <DofText role="caption" tone="muted">{{ statusView.meaning }}</DofText>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <DofButton v-if="store.status === 'live'" size="sm" variant="soft" tone="neutral" :loading="lifecycle.busy" @click="pauseStore">Pause store</DofButton>
            <DofButton v-else-if="store.status === 'paused'" size="sm" tone="accent" :loading="lifecycle.busy" @click="reopenStore">Reopen store</DofButton>
            <DofButton v-else-if="store.status === 'closed'" size="sm" tone="accent" :loading="lifecycle.busy" @click="restoreStore">Restore store</DofButton>
          </div>
        </div>

        <DofProblem v-if="lifecycle.error" title="Couldn’t update your store" :detail="lifecycle.error" />

        <!-- close lives behind progressive disclosure; never a bare destructive button -->
        <div v-if="store.status === 'live' || store.status === 'paused'" class="flex flex-col gap-2 border-t border-line pt-3">
          <button
            v-if="!lifecycle.confirmClose"
            type="button"
            class="dof-interactive self-start rounded-small text-caption text-foreground/60 underline-offset-4 hover:underline focus-visible:focus-ring"
            @click="lifecycle.confirmClose = true"
          >
            Close this store…
          </button>
          <div v-else class="flex flex-col gap-2 rounded-medium border border-caution/40 bg-caution/5 p-3">
            <DofText role="emphasis" as="h3">Close your store?</DofText>
            <ul class="flex list-none flex-col gap-1 p-0 text-caption text-foreground/80">
              <li>· Your store leaves DOF’s public discovery and buyers can’t start new orders.</li>
              <li>· Existing orders, refunds, and payouts are unaffected — obligations stay intact.</li>
              <li>· Your products, story, and followers are kept.</li>
              <li>· You can restore your store for 90 days; after that it becomes permanent.</li>
            </ul>
            <div class="flex items-center gap-2">
              <DofButton size="sm" tone="critical" :loading="lifecycle.busy" @click="closeStore">Close store</DofButton>
              <DofButton size="sm" variant="ghost" tone="neutral" @click="lifecycle.confirmClose = false">Keep it open</DofButton>
            </div>
          </div>
        </div>
      </section>

      <div v-if="loadingKit" class="flex flex-col gap-3" aria-hidden="true">
        <DofSkeleton v-for="n in 3" :key="n" class="h-16 rounded-large" />
      </div>

      <div v-else class="grid items-start gap-8 regular:grid-cols-[1fr_22rem]">
        <!-- ——— the identity editor -->
        <section aria-label="your identity" class="flex flex-col gap-4">
          <DofInput
            v-model="displayName"
            label="Store name"
            hint="How your shop is known — you can change this without changing your web address."
            placeholder="Rosa Knits"
            :maxlength="80"
          />

          <!-- Appearance: one accent + a logo. DOF owns the rest of the look. -->
          <div class="flex flex-col gap-3 rounded-medium border border-line p-3">
            <DofText role="emphasis" as="h3">Appearance</DofText>
            <div class="flex items-center gap-3">
              <input
                id="store-accent"
                v-model="accent"
                type="color"
                class="dof-interactive size-10 shrink-0 cursor-pointer rounded-medium border border-line bg-surface p-0.5 focus-visible:focus-ring"
              />
              <label for="store-accent" class="flex flex-col">
                <DofText role="body" class="font-medium">Accent colour</DofText>
                <DofText role="caption" tone="muted">Used for buttons and highlights on your storefront.</DofText>
              </label>
            </div>
            <div class="flex flex-col gap-1.5">
              <DofText role="body" class="font-medium">Logo</DofText>
              <DofMediaSlot v-if="businessId" v-model="logo" :upload="uploadMedia" />
              <DofText role="caption" tone="muted">A square image reads best. JPG, PNG, or WebP.</DofText>
            </div>
          </div>

          <DofInput
            v-model="tagline"
            label="Tagline"
            hint="One line under your name — how you’d introduce the shop at a market stall."
            placeholder="Soft things, made slowly."
            :maxlength="200"
          />

          <div class="flex flex-col gap-2">
            <DofTextarea
              v-model="story"
              label="Your story"
              :hint="`Why this shop exists — in your own words. ${500 - story.trim().length} characters left.`"
              placeholder="It started at a kitchen table…"
              :rows="4"
              :maxlength="500"
            />
            <div v-if="storyDraft" class="flex flex-col gap-1.5">
              <DofText role="caption" tone="muted">A starting point — tap to take it, then make it yours:</DofText>
              <button
                type="button"
                class="dof-interactive rounded-medium border border-dashed border-line p-3 text-start text-body text-foreground/80 transition-colors hover:border-accent focus-visible:focus-ring"
                @click="story = storyDraft"
              >
                {{ storyDraft }}
              </button>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <DofInput
              v-model="promise"
              label="Your promise"
              hint="What every customer can count on — it appears right where they decide to trust you."
              placeholder="If something isn’t right, we make it right."
              :maxlength="120"
            />
            <div v-if="promiseDrafts.length > 0" class="flex flex-wrap gap-2">
              <DofChip
                v-for="p in promiseDrafts" :key="p"
                :label="p"
                selectable @toggle="promise = p"
              />
            </div>
          </div>

          <DofProblem v-if="problem" title="Nothing was lost" :detail="problem" />
          <div class="flex items-center gap-3">
            <DofButton tone="accent" size="lg" icon="check" :disabled="!dirty" :loading="saving" @click="save">
              Save changes
            </DofButton>
            <DofText v-if="savedAt && !dirty" role="caption" class="text-positive">Live on your store.</DofText>
            <DofText v-else-if="draftRestored && dirty" role="caption" tone="muted">Restored your unsaved words — kept on this device until you save.</DofText>
            <DofText v-else-if="dirty" role="caption" tone="muted">Draft kept on this device.</DofText>
          </div>
        </section>

        <!-- ——— as customers see it: a true mirror of the storefront hero, in the
             store's own palette, always present (it fills as they type) -->
        <section aria-label="preview" class="flex flex-col gap-2 regular:sticky regular:top-6">
          <DofText role="emphasis" as="h2">As customers see it</DofText>
          <div v-bind="previewAttrs" class="overflow-hidden rounded-large border border-line">
            <div class="flex flex-col gap-2 border-b border-foreground/10 bg-surface p-5">
              <div class="flex items-center gap-3">
                <img v-if="logo" :src="logo.url" :alt="`${displayName || store.name} logo`" class="size-10 shrink-0 rounded-medium object-cover" />
                <DofText role="title" as="p">{{ displayName || store.name }}</DofText>
              </div>
              <DofText role="emphasis" as="p" :tone="tagline.trim() ? undefined : 'muted'">
                {{ tagline.trim() || `Welcome to ${displayName || store.name}.` }}
              </DofText>
              <DofText role="caption" class="text-accent">dof.dev/{{ store.handle }}</DofText>
            </div>
            <div class="flex flex-col gap-3 bg-surface p-5">
              <DofText v-if="story.trim()" role="body" class="text-foreground/90" reading>{{ story.trim() }}</DofText>
              <DofText v-else role="caption" tone="muted">Your story appears here as you write it.</DofText>
              <DofText v-if="promise.trim()" role="caption" class="text-positive">✓ {{ promise.trim() }}</DofText>
              <DofText v-if="followers > 0" role="caption" tone="muted">
                {{ followers === 1 ? '1 person follows' : `${followers} people follow` }} this store
              </DofText>
            </div>
          </div>
          <DofText role="caption" tone="muted">This is the top of your live storefront — word for word.</DofText>
        </section>
      </div>

      <!-- ——— shipping & promises: a summary + a door to /shipping (one shipping truth) -->
      <section aria-label="shipping and promises" class="flex flex-col gap-2 rounded-large border border-line bg-surface-raised p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <DofText role="emphasis" as="h2">Shipping &amp; promises</DofText>
          <NuxtLink to="/shipping" class="contents"><DofButton size="sm" variant="soft" tone="neutral">Manage shipping</DofButton></NuxtLink>
        </div>
        <DofText v-if="shipSummary" role="body" class="text-foreground/85">{{ shipSummary }}</DofText>
        <DofText v-if="returnWindowDays" role="caption" tone="muted">
          Returns: buyers can return within {{ returnWindowDays }} days of delivery — DOF’s standard promise, backing every store.
        </DofText>
      </section>

      <!-- ——— SV-2: your address on DOF (handle). Consequential: behind disclosure, needs a
           deliberate confirm. Old links keep working; nobody can take your old address. -->
      <section aria-label="store address" class="flex flex-col gap-3 rounded-large border border-line p-4">
        <div class="flex flex-col gap-0.5">
          <DofText role="emphasis" as="h2">Your address on DOF</DofText>
          <DofText role="caption" tone="muted">People find your store at <span class="text-accent">dof.dev/{{ store.handle }}</span></DofText>
        </div>
        <button
          v-if="!handleEdit.open"
          type="button"
          class="dof-interactive self-start rounded-small text-caption text-foreground/60 underline-offset-4 hover:underline focus-visible:focus-ring"
          @click="handleEdit.open = true"
        >
          Change your address…
        </button>
        <div v-else class="flex flex-col gap-2 rounded-medium border border-line bg-surface-raised p-3">
          <DofInput
            v-model="handleEdit.value"
            label="New address"
            hint="Lowercase letters, numbers, and hyphens. 3–30 characters."
            placeholder="rosa-knits"
            :maxlength="30"
            @update:model-value="onHandleInput"
          />
          <DofText v-if="handleEdit.checking" role="caption" tone="muted">Checking…</DofText>
          <DofText v-else-if="handleEdit.available === true" role="caption" class="text-positive">dof.dev/{{ handleEdit.value.trim().toLowerCase() }} is available.</DofText>
          <DofText v-else-if="handleEdit.available === false" role="caption" class="text-caution">
            {{ handleEdit.reason === 'invalid_format' ? 'That address isn’t allowed — use lowercase letters, numbers, and hyphens.' : 'That address is taken.' }}
          </DofText>
          <div v-if="handleEdit.available === false && handleEdit.suggestions.length" class="flex flex-wrap gap-2">
            <DofChip
              v-for="s in handleEdit.suggestions" :key="s"
              :label="s" selectable
              @toggle="handleEdit.value = s; onHandleInput()"
            />
          </div>
          <ul class="flex list-none flex-col gap-1 p-0 text-caption text-foreground/80">
            <li>· Your old address keeps working — visitors are sent to the new one automatically.</li>
            <li>· No one else can ever take your old address.</li>
            <li>· This asks you to confirm it’s really you.</li>
          </ul>
          <DofProblem v-if="handleEdit.error" title="Couldn’t change your address" :detail="handleEdit.error" />
          <div class="flex items-center gap-2">
            <DofButton
              size="sm" tone="accent"
              :disabled="handleEdit.available !== true || handleEdit.busy"
              :loading="handleEdit.busy"
              @click="submitHandle"
            >Change address</DofButton>
            <DofButton size="sm" variant="ghost" tone="neutral" @click="handleEdit.open = false; handleEdit.value = ''; handleEdit.available = null">Keep it</DofButton>
          </div>
        </div>
      </section>
    </template>

    <div v-else class="flex flex-col gap-3" aria-hidden="true">
      <DofSkeleton v-for="n in 2" :key="n" class="h-16 rounded-large" />
    </div>
  </div>
</template>
