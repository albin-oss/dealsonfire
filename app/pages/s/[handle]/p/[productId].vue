<script setup lang="ts">
/**
 * /s/:handle/p/:productId — the public product page (Release 0.2). What a shared link
 * opens: the product, dressed in the merchant's brand, with the store one tap away.
 * SSR (link unfurls carry the product title); visible-only (VISIBILITY_CONTRACT §1);
 * anything hidden is an indistinguishable 404 (V6). This page is the First Customer's
 * first impression — calm, honest, no dead ends.
 */
import { computed } from 'vue'
import { useBrandKit, DofText, DofMoney, DofButton } from '@ds/index'
import type { PublicProductResponse } from '@contracts/schemas/merchant/public-storefront.schema'

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

useHead({
  title: () => `${product.value.title} — ${store.value.name}`,
  htmlAttrs: { 'data-scope': 'storefront' },
})

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

    <main class="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10 regular:flex-row regular:gap-12">
      <div class="flex h-72 flex-1 items-center justify-center rounded-large bg-accent/10 text-caption text-foreground/60" aria-hidden="true">
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

        <!-- Orders arrive in the next journey; until then the honest action is the store itself -->
        <div class="flex flex-col gap-2 pt-2">
          <NuxtLink :to="`/s/${store.handle}`" class="contents">
            <DofButton tone="accent" size="lg" icon="store">See everything from {{ store.name }}</DofButton>
          </NuxtLink>
          <DofText role="caption" class="text-foreground/60">
            Ordering online is coming — for now, reach out to {{ store.name }} directly.
          </DofText>
        </div>
      </section>
    </main>

    <footer class="border-t border-foreground/10">
      <div class="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 text-caption text-foreground/60">
        <NuxtLink :to="`/s/${store.handle}`" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">{{ store.name }}</NuxtLink>
        <span>powered by DOF</span>
      </div>
    </footer>
  </div>
</template>
