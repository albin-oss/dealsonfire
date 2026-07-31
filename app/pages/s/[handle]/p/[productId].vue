<script setup lang="ts">
/**
 * /s/:handle/p/:productId — the public product page (Release 0.2). What a shared link
 * opens: the product, dressed in the merchant's brand, with the store one tap away.
 * SSR (link unfurls carry the product title); visible-only (VISIBILITY_CONTRACT §1);
 * anything hidden is an indistinguishable 404 (V6). This page is the First Customer's
 * first impression — calm, honest, no dead ends.
 */
import { computed, ref, watch } from 'vue'
import { useBrandKit, DofText, DofMoney, DofButton, DofChip, DofTime, announce } from '@ds/index'
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

// ——— the cart (Commerce Foundation C1): pick a size or color when there's a choice,
// then one tap puts it in the basket — anonymous-first, the visitor identity mints on add
const variants = computed(() => product.value.variants)
const selectedVariantId = ref<string | null>(null)
watch(variants, (list) => {
  if (list.length === 1 && list[0]) selectedVariantId.value = list[0].id
  else if (!list.some((v) => v.id === selectedVariantId.value)) selectedVariantId.value = null
}, { immediate: true })
const selectedVariant = computed(() => variants.value.find((v) => v.id === selectedVariantId.value) ?? null)
const shownPrice = computed(() => selectedVariant.value?.price_minor ?? product.value.price_minor)
const shownCurrency = computed(() => selectedVariant.value?.currency ?? product.value.currency ?? 'EUR')

const addingToCart = ref(false)
const inCart = ref(false)
async function addToCart() {
  if (!selectedVariantId.value || addingToCart.value) return
  addingToCart.value = true
  try {
    await $fetch('/api/v1/public/cart/lines', {
      method: 'POST',
      body: { variant_id: selectedVariantId.value, quantity: 1 },
    })
    inCart.value = true
    announce(`${product.value.title} is in your cart.`)
  } catch {
    announce('That didn’t take — try again.')
  } finally {
    addingToCart.value = false
  }
}

// ——— share: the one street-wide idiom (native sheet on mobile, copy elsewhere)
import { useShare } from '../../../../composables/use-share'
const { sharedId, share: shareLink } = useShare()
const share = () => shareLink('product', {
  title: product.value.title,
  text: `${product.value.title} — ${store.value.name}`,
  url: productCanonical(seoFacts.value),
})

// ——— more from this store (reuse the cached shelf read — zero new backend)
const { data: shelf } = useFetch<PublicStorefrontResponse>(
  () => `/api/v1/public/stores/${encodeURIComponent(handle.value)}`,
  { lazy: true, server: false },
)
const related = computed(() =>
  (shelf.value?.products ?? []).filter((p) => p.id !== product.value.id).slice(0, 3))
// when this product reached the shelf — from the same cached read (client-side, so the
// relative text never has to survive hydration)
const addedAt = computed(() =>
  shelf.value?.products.find((p) => p.id === product.value.id)?.published_at ?? null)

import { useRecentlyViewed } from '../../../../composables/use-recently-viewed'
const { record } = useRecentlyViewed()
onMounted(() => record({ kind: 'product', to: `/s/${store.value.handle}/p/${product.value.id}`, title: product.value.title, context: store.value.name }))

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
      <PublicImg
        v-if="product.image_url"
        :src="product.image_url"
        :alt="product.image_alt ?? product.title"
        img-class="h-72 flex-1 rounded-large object-cover"
        eager
      />
      <div v-else class="flex h-72 flex-1 items-center justify-center rounded-large bg-accent/10 text-caption text-foreground/60" aria-hidden="true">
        {{ store.name }}
      </div>

      <section class="flex flex-1 flex-col gap-4" :aria-label="product.title">
        <div class="flex flex-col gap-2">
          <DofText role="headline" as="h1">{{ product.title }}</DofText>
          <DofMoney
            v-if="shownPrice !== null"
            :amount="shownPrice"
            :currency="shownCurrency"
            class="text-title font-semibold"
          />
        </div>
        <DofText v-if="product.description" role="body" class="text-foreground/90" reading>
          {{ product.description }}
        </DofText>
        <DofText v-else-if="brand?.tagline" role="body" tone="muted">{{ brand.tagline }}</DofText>

        <DofText role="caption" class="text-positive">
          Available now<template v-if="addedAt"> · added <DofTime :value="addedAt" mode="relative" /></template>
        </DofText>
        <DofText v-if="brand?.promise" role="caption" class="text-foreground/80">✓ {{ brand.promise }}</DofText>

        <!-- sizes & colors: the same words the merchant chose (Commerce Foundation C1) -->
        <div v-if="variants.length > 1" class="flex flex-col gap-1.5 pt-1" role="group" aria-label="choose an option">
          <DofText role="caption" class="text-foreground/70">Choose one:</DofText>
          <div class="flex flex-wrap gap-2">
            <DofChip
              v-for="v in variants" :key="v.id"
              :label="v.label ?? 'Standard'"
              :selected="selectedVariantId === v.id"
              selectable @toggle="selectedVariantId = v.id"
            />
          </div>
        </div>

        <div class="flex flex-col gap-2 pt-2">
          <div class="flex flex-wrap gap-2">
            <NuxtLink v-if="inCart" to="/cart" class="contents">
              <DofButton tone="accent" size="lg" icon="check">In your cart — view</DofButton>
            </NuxtLink>
            <DofButton
              v-else-if="variants.length > 0"
              tone="accent" size="lg" icon="package"
              :disabled="!selectedVariantId" :loading="addingToCart"
              @click="addToCart"
            >
              {{ selectedVariantId || variants.length === 1 ? 'Add to cart' : 'Choose an option first' }}
            </DofButton>
            <NuxtLink :to="`/s/${store.handle}`" class="contents">
              <DofButton variant="soft" tone="neutral" size="lg" icon="store">Everything from {{ store.name }}</DofButton>
            </NuxtLink>
            <DofButton variant="soft" tone="neutral" size="lg" icon="share-2" @click="share">
              {{ sharedId === 'product' ? 'Link copied' : 'Share' }}
            </DofButton>
          </div>
          <DofText role="caption" class="text-foreground/60">
            You’re charged when your order is confirmed — and {{ store.name }} isn’t paid until it ships.
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
              <PublicImg v-if="item.image_url" :src="item.image_url" :alt="item.image_alt ?? item.title" img-class="h-20 w-full rounded-medium object-cover" />
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
