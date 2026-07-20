<script setup lang="ts">
/**
 * /store — Store Identity (Release 0.5). The coming-soon stub becomes the journey the
 * workspace has pointed at since day one ("share-store" lands here): see your store as
 * customers see it, and say who you are — tagline, story, promise. Drafts are advisory
 * (the authoring-intelligence idiom): AI suggests, the merchant decides. Saving is the
 * existing whole-value Brand Kit PUT — no new write paths.
 */
import { computed, ref, watch } from 'vue'
import {
  DofText, DofButton, DofInput, DofTextarea, DofChip,
  DofEmptyState, DofSkeleton, DofProblem, announce,
} from '@ds/index'
import type { BrandKitResponse } from '@contracts/schemas/merchant/brand-kit.schema'
import { draftStory, draftPromises } from '../composables/identity-intelligence'
import { devUserId } from '../composables/ignite/launch'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Your store — DOF' })

// ——— workspace context (the same spine as Products and Deals)
const headers = { 'x-dof-user-id': import.meta.client ? devUserId() : '' }
const { data: workspace } = useFetch<{ businesses: Array<{ business_id: string; stores: Array<{ store_id: string; handle: string; name: string; status: string }> }> }>('/api/v1/workspace', {
  lazy: true, server: false, headers,
})
const businessId = computed(() => workspace.value?.businesses[0]?.business_id ?? null)
const store = computed(() => workspace.value?.businesses[0]?.stores[0] ?? null)
const storeUrl = computed(() => (store.value ? `/s/${store.value.handle}` : null))

// ——— the shelf (context for honest drafts)
interface GridRow { id: string; title: string; on_store: boolean }
const { data: grid, refresh: refreshGrid } = useFetch<{ items: GridRow[] }>(
  () => `/api/v1/products?business_id=${businessId.value}&limit=24${store.value ? `&channel_id=${store.value.store_id}` : ''}`,
  { lazy: true, server: false, headers, immediate: false },
)

// ——— the identity (Brand Kit voice)
const kit = ref<BrandKitResponse | null>(null)
const loadingKit = ref(false)
const tagline = ref('')
const story = ref('')
const promise = ref('')

async function loadKit() {
  if (!store.value) return
  loadingKit.value = true
  try {
    kit.value = await $fetch<BrandKitResponse>(`/api/v1/stores/${store.value.store_id}/brand-kit`, { headers })
    tagline.value = kit.value.voice.tone ?? ''
    story.value = kit.value.voice.story ?? ''
    promise.value = kit.value.voice.promise ?? ''
  } catch { /* the editor teaches from blank */ } finally {
    loadingKit.value = false
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
    promise.value.trim() !== (kit.value.voice.promise ?? '')
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
        name: kit.value.name,
        logo_media_id: kit.value.logo_media_id,
        palette: kit.value.palette,
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
    announce('Saved — your store now says who you are.')
  } catch (error) {
    problem.value = (error as { data?: { detail?: string } }).data?.detail ?? 'That didn’t take — nothing was lost; try again.'
  } finally {
    saving.value = false
  }
}

async function copyStoreLink() {
  if (!storeUrl.value) return
  try {
    await navigator.clipboard.writeText(`${window.location.origin}${storeUrl.value}`)
    announce('Link copied — send it to someone.')
  } catch { announce(`${window.location.origin}${storeUrl.value}`) }
}
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
    <section class="flex flex-wrap items-end justify-between gap-3">
      <div class="flex flex-col gap-1">
        <DofText role="headline" as="h1">Your store</DofText>
        <DofText role="body" tone="muted">People buy from people — tell them who you are.</DofText>
      </div>
      <div v-if="storeUrl && store?.status === 'live'" class="flex gap-2">
        <NuxtLink :to="`${storeUrl}?v=${Date.now()}`" target="_blank" class="contents">
          <DofButton size="sm" tone="accent" icon="external-link">View live</DofButton>
        </NuxtLink>
        <DofButton size="sm" variant="soft" tone="neutral" icon="copy" @click="copyStoreLink">Copy link</DofButton>
      </div>
    </section>

    <DofEmptyState
      v-if="workspace && !store"
      icon="store"
      title="Your store goes here"
      why="Ignite opens the doors in about four minutes — then this page is where it learns to speak."
    >
      <NuxtLink to="/ignite" class="contents"><DofButton tone="accent">Start Ignite</DofButton></NuxtLink>
    </DofEmptyState>

    <template v-else-if="store">
      <div v-if="loadingKit" class="flex flex-col gap-3" aria-hidden="true">
        <DofSkeleton v-for="n in 3" :key="n" class="h-16 rounded-large" />
      </div>

      <template v-else>
        <!-- ——— the identity editor -->
        <section aria-label="your identity" class="flex flex-col gap-4">
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
                @click="promise = p"
              />
            </div>
          </div>

          <DofProblem v-if="problem" title="Nothing was lost" :detail="problem" />
          <div class="flex items-center gap-3">
            <DofButton tone="accent" size="lg" icon="check" :disabled="!dirty" :loading="saving" @click="save">
              Save identity
            </DofButton>
            <DofText v-if="savedAt && !dirty" role="caption" class="text-positive">Live on your store.</DofText>
          </div>
        </section>

        <!-- ——— as customers see it -->
        <section v-if="tagline.trim() || story.trim() || promise.trim()" aria-label="preview" class="flex flex-col gap-2">
          <DofText role="emphasis" as="h2">As customers see it</DofText>
          <div class="flex flex-col gap-3 rounded-large border border-line bg-surface-raised p-5">
            <div class="flex flex-col gap-0.5">
              <DofText role="title" as="p">{{ store.name }}</DofText>
              <DofText v-if="tagline.trim()" role="caption" tone="muted">{{ tagline.trim() }}</DofText>
            </div>
            <DofText v-if="story.trim()" role="body" class="text-foreground/90" reading>{{ story.trim() }}</DofText>
            <DofText v-if="promise.trim()" role="caption" class="text-positive">✓ {{ promise.trim() }}</DofText>
          </div>
        </section>
      </template>
    </template>

    <div v-else class="flex flex-col gap-3" aria-hidden="true">
      <DofSkeleton v-for="n in 2" :key="n" class="h-16 rounded-large" />
    </div>
  </div>
</template>
