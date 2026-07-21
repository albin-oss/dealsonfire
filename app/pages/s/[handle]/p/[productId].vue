<script setup lang="ts">
/**
 * /s/:handle/p/:productId — the public product page (Release 0.2). What a shared link
 * opens: the product, dressed in the merchant's brand, with the store one tap away.
 * SSR (link unfurls carry the product title); visible-only (VISIBILITY_CONTRACT §1);
 * anything hidden is an indistinguishable 404 (V6). This page is the First Customer's
 * first impression — calm, honest, no dead ends.
 */
import { computed, ref } from 'vue'
import { useBrandKit, DofText, DofMoney, DofButton, announce } from '@ds/index'
import type { PublicProductResponse, PublicStorefrontResponse } from '@contracts/schemas/merchant/public-storefront.schema'
import { productMeta, productJsonLd, productCanonical } from '../../../../composables/public-seo'

definePageMeta({ layout: false })

const route = useRoute()
const handle = computed(() => String(route.params.handle ?? ''))
const productId = computed(() => String(route.params.productId ?? ''))

const { data, error } = await useFetch<PublicProductResponse>(
  () => `/api/v1/public/stores/${encodeURIComponent(handle.value)}/products/${encodeURIComponent(productId.value)}`,
)
if (error.value || !data.value) {
  throw createError({ statusCode: 404, statusMessage: 'This product does not exist', fatal: true })
}
const store = computed(() => data.value!.store)
const brand = computed(() => data.value!.brand)
const product = computed(() => data.value!.product)

// ——— the head: unfurls, canonical, structured data (VS 005 — one SEO voice)
const origin = useRequestURL().origin
const seoFacts = computed(() => ({
  origin,
  handle: store.value.handle,
  productId: product.value.id,
  title: product.value.title,
  description: product.value.description,
  storeName: store.value.name,
  priceMinor: product.value.price_minor,
  currency: product.value.currency,
  imageUrl: product.value.image_url,
}))
useHead({
  title: () => `${product.value.title} — ${store.value.name}`,
  htmlAttrs: { 'data-scope': 'storefront' },
  link: [{ rel: 'canonical', href: productCanonical(seoFacts.value) }],
  script: [{ type: 'application/ld+json', innerHTML: productJsonLd(seoFacts.value) }],
})
useSeoMeta(productMeta(seoFacts.value))

// ——— share: the customer-side loop (native sheet on mobile, copy elsewhere)
const shared = ref(false)
async function share() {
  const url = productCanonical(seoFacts.value)
  const payload = { title: product.value.title, text: `${product.value.title} — ${store.value.name}`, url }
  try {
    if (navigator.share) { await navigator.share(payload) }
    else { await navigator.clipboard.writeText(url); shared.value = true; setTimeout(() => (shared.value = false), 2000) }
    announce('Link ready to share.')
  } catch { /* user dismissed the sheet — nothing to do */ }
}

// ——— more from this store (reuse the cached shelf read — zero new backend)
const { data: shelf } = useFetch<PublicStorefrontResponse>(
  () => `/api/v1/public/stores/${encodeURIComponent(handle.value)}`,
  { lazy: true, server: false },
)
const related = computed(() =>
  (shelf.value?.products ?? []).filter((p) => p.id !== product.value.id).slice(0, 3))

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
  <div v-bind="scopeAttrs">
    <StoreShell :store-name="store.name" :handle="store.handle" width="wide">

    <main class="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10 regular:flex-row regular:gap-12">
      <img
        v-if="product.image_url"
        :src="product.image_url"
        :alt="product.image_alt ?? product.title"
        class="h-72 flex-1 rounded-large object-cover"
      >
      <div v-else class="flex h-72 flex-1 items-center justify-center rounded-large bg-accent/10 text-caption text-foreground/60" aria-hidden="true">
        {{ store.name }}
      </div>

      <section class="flex flex-1 flex-col gap-4" :aria-label="product.title">
        <div class="flex flex-col gap-2">
          <DofText role="headline" as="h1">{{ product.title }}</DofText>
          <DofMoney
            v-if="product.price_minor !== null"
            :amount="product.price_minor"
            :currency="product.currency ?? 'EUR'"
            class="text-title font-semibold"
          />
        </div>
        <DofText v-if="product.description" role="body" class="text-foreground/90" reading>
          {{ product.description }}
        </DofText>
        <DofText v-else-if="brand?.tagline" role="body" tone="muted">{{ brand.tagline }}</DofText>

        <DofText role="caption" class="text-positive">Available now</DofText>
        <DofText v-if="brand?.promise" role="caption" class="text-foreground/80">✓ {{ brand.promise }}</DofText>

        <!-- Orders arrive in the next journey; until then the honest action is the store itself -->
        <div class="flex flex-col gap-2 pt-2">
          <div class="flex flex-wrap gap-2">
            <NuxtLink :to="`/s/${store.handle}`" class="contents">
              <DofButton tone="accent" size="lg" icon="store">See everything from {{ store.name }}</DofButton>
            </NuxtLink>
            <DofButton variant="soft" tone="neutral" size="lg" icon="share-2" @click="share">
              {{ shared ? 'Link copied' : 'Share' }}
            </DofButton>
          </div>
          <DofText role="caption" class="text-foreground/60">
            Ordering online is coming — for now, reach out to {{ store.name }} directly.
          </DofText>
        </div>
      </section>
    </main>

    <!-- ——— more from this store (the shelf, minus this product) -->
    <section v-if="related.length > 0" aria-label="more from this store" class="border-t border-foreground/10">
      <div class="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-8">
        <DofText role="emphasis" as="h2">More from {{ store.name }}</DofText>
        <ul class="grid list-none grid-cols-3 gap-4 p-0">
          <li v-for="item in related" :key="item.id">
            <NuxtLink
              :to="`/s/${store.handle}/p/${item.id}`"
              class="dof-interactive flex flex-col gap-2 rounded-large border border-foreground/10 bg-foreground/[0.03] p-3 transition-colors hover:border-foreground/25 focus-visible:focus-ring"
            >
              <img v-if="item.image_url" :src="item.image_url" :alt="item.image_alt ?? item.title" class="h-20 w-full rounded-medium object-cover" loading="lazy">
              <div v-else class="flex h-20 items-center justify-center rounded-medium bg-accent/10 text-caption text-foreground/60" aria-hidden="true">{{ store.name }}</div>
              <DofText role="caption" class="truncate font-medium text-foreground">{{ item.title }}</DofText>
              <DofMoney v-if="item.price_minor !== null" :amount="item.price_minor" :currency="item.currency ?? 'EUR'" class="text-caption" />
            </NuxtLink>
          </li>
        </ul>
      </div>
    </section>

    </StoreShell>
  </div>
</template>
