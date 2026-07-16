<script setup lang="ts">
/**
 * /s/:handle/d/:dealId — the public Deal page (Release 0.3, the first social artifact).
 * The promotion voice leads: headline as the hook, story as the pitch, then the product
 * card and the store. SSR (unfurls carry the headline + photo); visible iff the deal AND
 * its product pass the conjunction (V6: anything else is an indistinguishable 404).
 */
import { computed, ref } from 'vue'
import { useBrandKit, DofText, DofMoney, DofButton, announce } from '@ds/index'
import type { PublicDealResponse } from '@contracts/schemas/merchant/public-storefront.schema'
import { dealMeta, dealCanonical, productJsonLd } from '../../../../composables/public-seo'

definePageMeta({ layout: false })

const route = useRoute()
const handle = computed(() => String(route.params.handle ?? ''))
const dealId = computed(() => String(route.params.dealId ?? ''))

const { data, error } = await useFetch<PublicDealResponse>(
  () => `/api/v1/public/stores/${encodeURIComponent(handle.value)}/deals/${encodeURIComponent(dealId.value)}`,
)
if (error.value || !data.value) {
  throw createError({ statusCode: 404, statusMessage: 'This deal does not exist', fatal: true })
}
const store = computed(() => data.value!.store)
const brand = computed(() => data.value!.brand)
const deal = computed(() => data.value!.deal)
const product = computed(() => data.value!.product)

// ——— the head (VS 005 builders — the one SEO voice; JSON-LD stays a Product: accurate)
const origin = useRequestURL().origin
const seoFacts = computed(() => ({
  origin,
  handle: store.value.handle,
  dealId: deal.value.id,
  headline: deal.value.headline,
  story: deal.value.story,
  storeName: store.value.name,
  productTitle: product.value.title,
  imageUrl: product.value.image_url,
}))
useHead({
  title: () => `${deal.value.headline} — ${store.value.name}`,
  htmlAttrs: { 'data-scope': 'storefront' },
  link: [{ rel: 'canonical', href: dealCanonical(seoFacts.value) }],
  script: [{
    type: 'application/ld+json',
    innerHTML: productJsonLd({
      origin,
      handle: store.value.handle,
      productId: product.value.id,
      title: product.value.title,
      description: deal.value.story ?? product.value.description,
      storeName: store.value.name,
      priceMinor: product.value.price_minor,
      currency: product.value.currency,
      imageUrl: product.value.image_url,
    }),
  }],
})
useSeoMeta(dealMeta(seoFacts.value))

// ——— share (same idiom as the product page)
const shared = ref(false)
async function share() {
  const url = dealCanonical(seoFacts.value)
  const payload = { title: deal.value.headline, text: `${deal.value.headline} — ${store.value.name}`, url }
  try {
    if (navigator.share) { await navigator.share(payload) }
    else { await navigator.clipboard.writeText(url); shared.value = true; setTimeout(() => (shared.value = false), 2000) }
    announce('Link ready to share.')
  } catch { /* user dismissed the sheet — nothing to do */ }
}

// ——— engagement (Release 0.4): per-visitor snapshot, fetched client-side so the deal
// read itself stays shared-cacheable
const { data: engagement } = useFetch<{
  fires: number; saves: number; followers: number
  viewer_reacted: boolean; viewer_saved: boolean; viewer_follows: boolean
}>(() => `/api/v1/public/deals/${deal.value.id}/engagement`, { lazy: true, server: false })

const { scopeAttrs } = useBrandKit(computed(() => ({
  accent: brand.value?.palette.primary,
  accentStrong: brand.value?.palette.primary,
  onAccent: brand.value?.palette.surface,
  surface: brand.value?.palette.surface,
  surfaceRaised: brand.value?.palette.surface,
  text: brand.value?.palette.text,
  textMuted: brand.value?.palette.text,
})))
</script>

<template>
  <div v-bind="scopeAttrs" class="min-h-dvh bg-surface font-ui text-foreground">
    <header class="border-b border-foreground/10">
      <div class="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4">
        <NuxtLink :to="`/s/${store.handle}`" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">
          <DofText role="title" as="span">{{ store.name }}</DofText>
        </NuxtLink>
        <nav aria-label="store" class="flex gap-4 text-caption text-foreground/80">
          <NuxtLink :to="`/s/${store.handle}`" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">Shop</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10">
      <!-- the promotion voice leads -->
      <section class="flex flex-col gap-3 text-center">
        <DofText role="caption" class="uppercase tracking-widest text-accent">A deal from {{ store.name }}</DofText>
        <DofText role="headline" as="h1">{{ deal.headline }}</DofText>
        <DofText v-if="deal.story" role="body" class="mx-auto max-w-prose text-foreground/90" reading>
          {{ deal.story }}
        </DofText>
      </section>

      <!-- the product it points at -->
      <NuxtLink
        :to="`/s/${store.handle}/p/${product.id}`"
        class="dof-interactive mx-auto flex w-full max-w-lg flex-col gap-3 rounded-large border border-foreground/10 bg-foreground/[0.03] p-4 transition-colors hover:border-foreground/25 focus-visible:focus-ring"
        :aria-label="`See ${product.title}`"
      >
        <img
          v-if="product.image_url"
          :src="product.image_url"
          :alt="product.image_alt ?? product.title"
          class="h-64 w-full rounded-medium object-cover"
        >
        <div v-else class="flex h-64 items-center justify-center rounded-medium bg-accent/10 text-caption text-foreground/60" aria-hidden="true">
          {{ store.name }}
        </div>
        <div class="flex items-baseline justify-between gap-3">
          <DofText role="title" as="h2" class="truncate">{{ product.title }}</DofText>
          <DofMoney
            v-if="product.price_minor !== null"
            :amount="product.price_minor"
            :currency="product.currency ?? 'EUR'"
            class="shrink-0 text-title font-semibold"
          />
        </div>
        <DofText v-if="product.description" role="caption" class="line-clamp-2 text-foreground/70">
          {{ product.description }}
        </DofText>
      </NuxtLink>

      <div class="mx-auto flex flex-wrap justify-center gap-2">
        <NuxtLink :to="`/s/${store.handle}/p/${product.id}`" class="contents">
          <DofButton tone="accent" size="lg" icon="package">See the product</DofButton>
        </NuxtLink>
        <DofButton variant="soft" tone="neutral" size="lg" icon="share-2" @click="share">
          {{ shared ? 'Link copied' : 'Share this deal' }}
        </DofButton>
      </div>

      <div class="mx-auto">
        <DealEngage
          :deal-id="deal.id"
          :store-handle="store.handle"
          :store-name="store.name"
          :fires="engagement?.fires ?? 0"
          :reacted="engagement?.viewer_reacted ?? false"
          :saved="engagement?.viewer_saved ?? false"
          :follows="engagement?.viewer_follows ?? false"
          variant="full"
        />
      </div>

      <NuxtLink to="/discover" class="dof-interactive mx-auto rounded-small px-1 text-caption text-foreground/70 underline-offset-4 hover:underline focus-visible:focus-ring">
        More deals on DOF →
      </NuxtLink>
    </main>

    <footer class="border-t border-foreground/10">
      <div class="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 text-caption text-foreground/60">
        <NuxtLink :to="`/s/${store.handle}`" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">{{ store.name }}</NuxtLink>
        <span>powered by DOF</span>
      </div>
    </footer>
  </div>
</template>
