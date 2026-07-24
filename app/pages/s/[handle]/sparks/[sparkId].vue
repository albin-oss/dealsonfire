<script setup lang="ts">
/**
 * /s/:handle/sparks/:sparkId — the public Spark page (Release 0.6). The store speaking,
 * in its own palette: the update leads, the photo carries it, the product card rides
 * only while the product is visible, and every path continues the journey (product,
 * store, follow, share). SSR; V6 404-masked.
 */
import { computed } from 'vue'
import { useBrandKit, DofText, DofMoney, DofButton, DofTime } from '@ds/index'
import { useShare } from '../../../../composables/use-share'
import type { PublicSparkResponse, PublicStorefrontResponse } from '@contracts/schemas/merchant/public-storefront.schema'
import { sparkMeta, sparkCanonical } from '../../../../composables/public-seo'

definePageMeta({ layout: false })

const route = useRoute()
const handle = computed(() => String(route.params.handle ?? ''))
const sparkId = computed(() => String(route.params.sparkId ?? ''))

const { data, error } = await useFetch<PublicSparkResponse>(
  () => `/api/v1/public/stores/${encodeURIComponent(handle.value)}/sparks/${encodeURIComponent(sparkId.value)}`,
)
if (error.value || !data.value) {
  throw createError({ statusCode: 404, statusMessage: 'This spark does not exist', fatal: true })
}
const store = computed(() => data.value!.store)
const brand = computed(() => data.value!.brand)
const spark = computed(() => data.value!.spark)
const product = computed(() => data.value!.product)

// ——— the head (the one SEO voice)
const origin = useRequestURL().origin
const seoFacts = computed(() => ({
  origin,
  handle: store.value.handle,
  sparkId: spark.value.id,
  body: spark.value.body,
  storeName: store.value.name,
  imageUrl: spark.value.image_url ?? product.value?.image_url ?? null,
}))
useHead({
  title: () => `${store.value.name} — on DOF`,
  htmlAttrs: { 'data-scope': 'storefront' },
  link: [{ rel: 'canonical', href: sparkCanonical(seoFacts.value) }],
})
useSeoMeta(sparkMeta(seoFacts.value))

// ——— share: the one street-wide idiom
const { sharedId, share: shareLink } = useShare()
const share = () => shareLink('spark', {
  title: `${store.value.name} on DOF`,
  text: spark.value.body.slice(0, 120),
  url: sparkCanonical(seoFacts.value),
})

// ——— engagement (per-visitor, client-side so the spark read stays cacheable)
const { data: engagement } = useFetch<{
  fires: number; followers: number; viewer_reacted: boolean; viewer_follows: boolean
}>(() => `/api/v1/public/sparks/${spark.value.id}/engagement`, { lazy: true, server: false })

const { scopeAttrs } = useBrandKit(computed(() => ({
  accent: brand.value?.palette.primary,
  accentStrong: brand.value?.palette.primary,
  onAccent: brand.value?.palette.surface,
  surface: brand.value?.palette.surface,
  surfaceRaised: brand.value?.palette.surface,
  text: brand.value?.palette.text,
  textMuted: brand.value?.palette.text,
})))

// ——— more from this store (Increment 11): the cached shelf read carries the latest
// sparks — the page never dead-ends on one update. Client-side, zero new backend.
const { data: shelf } = useFetch<PublicStorefrontResponse>(
  () => `/api/v1/public/stores/${encodeURIComponent(handle.value)}`,
  { lazy: true, server: false },
)
const moreSparks = computed(() =>
  (shelf.value?.sparks ?? []).filter((sp) => sp.id !== spark.value.id).slice(0, 3))
</script>

<template>
  <div v-bind="scopeAttrs">
    <StoreShell :store-name="store.name" :handle="store.handle" width="narrow">

    <main class="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <article class="flex flex-col gap-4" :aria-label="`update from ${store.name}`">
        <div class="flex items-baseline justify-between gap-2">
          <DofText role="caption" class="uppercase tracking-widest text-accent">{{ store.name }}</DofText>
          <DofText role="caption" class="text-foreground/60"><DofTime :value="spark.published_at" mode="relative" /></DofText>
        </div>
        <DofText role="title" as="h1" class="whitespace-pre-line" reading>{{ spark.body }}</DofText>
        <PublicImg
          v-if="spark.image_url"
          :src="spark.image_url"
          :alt="`photo from ${store.name}`"
          img-class="max-h-96 w-full rounded-large object-cover"
          eager
        />

        <!-- the product it points at (rides only while visible) -->
        <NuxtLink
          v-if="product"
          :to="`/s/${store.handle}/p/${product.id}`"
          class="dof-interactive flex items-center gap-3 rounded-large border border-foreground/10 bg-foreground/[0.03] p-3 transition-colors hover:border-foreground/25 focus-visible:focus-ring"
          :aria-label="`See ${product.title}`"
        >
          <PublicImg v-if="product.image_url" :src="product.image_url" :alt="product.image_alt ?? product.title" img-class="size-16 shrink-0 rounded-medium object-cover" />
          <div v-else class="flex size-16 shrink-0 items-center justify-center rounded-medium bg-accent/10 text-caption text-foreground/60" aria-hidden="true">·</div>
          <div class="flex min-w-0 flex-1 flex-col">
            <DofText role="body" class="truncate font-medium">{{ product.title }}</DofText>
            <DofMoney v-if="product.price_minor !== null" :amount="product.price_minor" :currency="product.currency ?? 'EUR'" class="text-caption text-foreground/70" />
          </div>
          <DofText role="caption" class="shrink-0 text-accent">See it →</DofText>
        </NuxtLink>
      </article>

      <div class="flex flex-wrap items-center gap-2">
        <DealEngage
          kind="spark"
          :deal-id="spark.id"
          :store-handle="store.handle"
          :store-name="store.name"
          :fires="engagement?.fires ?? 0"
          :reacted="engagement?.viewer_reacted ?? false"
          :follows="engagement?.viewer_follows ?? false"
          variant="full"
        />
        <DofButton size="sm" variant="soft" tone="neutral" icon="share-2" @click="share">
          {{ sharedId === 'spark' ? 'Link copied' : 'Share' }}
        </DofButton>
      </div>

      <!-- ——— more from this store: the conversation continues (Increment 11) -->
      <section v-if="moreSparks.length > 0" aria-label="more from this store" class="flex flex-col gap-2 border-t border-foreground/10 pt-4">
        <DofText role="emphasis" as="h2">More from {{ store.name }}</DofText>
        <ul class="flex list-none flex-col gap-2 p-0">
          <li v-for="sp in moreSparks" :key="sp.id">
            <NuxtLink
              :to="`/s/${store.handle}/sparks/${sp.id}`"
              class="dof-interactive flex items-start gap-3 rounded-large border border-foreground/10 bg-foreground/[0.02] p-3 transition-colors hover:border-foreground/25 focus-visible:focus-ring"
            >
              <PublicImg v-if="sp.image_url" :src="sp.image_url" alt="" img-class="size-12 shrink-0 rounded-medium object-cover" />
              <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                <DofText role="body" class="line-clamp-2 text-foreground/90">{{ sp.body }}</DofText>
                <DofText role="caption" class="text-foreground/60"><DofTime :value="sp.published_at" mode="relative" /></DofText>
              </div>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <div class="flex flex-col gap-2 border-t border-foreground/10 pt-4">
        <NuxtLink :to="`/s/${store.handle}`" class="contents">
          <DofButton tone="accent" icon="store">Visit {{ store.name }}</DofButton>
        </NuxtLink>
        <DofText v-if="brand?.promise" role="caption" class="text-foreground/70">✓ {{ brand.promise }}</DofText>
      </div>
    </main>

    </StoreShell>
  </div>
</template>
