<script setup lang="ts">
/**
 * /s/:handle — the public storefront (UX-IGNITE Phase 3). The world's view of a live
 * store: the merchant's brand palette dresses the page (the same D-34 cascade the Ignite
 * preview uses — the preview and the real thing are literally the same rendering idea),
 * the shelf shows active products, and nothing else exists. SSR so the first paint IS the
 * store (LCP budget), and links unfurl with the merchant's name.
 */
import { computed } from 'vue'
import { useBrandKit, DofText, DofMoney, DofEmptyState } from '@ds/index'
import type { PublicStorefrontResponse } from '@contracts/schemas/merchant/public-storefront.schema'
import { storeMeta } from '../../../composables/public-seo'

definePageMeta({ layout: false })

const route = useRoute()
const handle = computed(() => String(route.params.handle ?? ''))

const { data, error } = await useFetch<PublicStorefrontResponse>(
  () => `/api/v1/public/stores/${encodeURIComponent(handle.value)}`,
)
if (error.value || !data.value) {
  throw createError({ statusCode: 404, statusMessage: 'This store does not exist', fatal: true })
}
const store = computed(() => data.value!.store)
const brand = computed(() => data.value!.brand)
const products = computed(() => data.value!.products)

const origin = useRequestURL().origin
useHead({
  title: () => `${store.value.name} — dof.dev/${store.value.handle}`,
  htmlAttrs: { 'data-scope': 'storefront' },
  link: [{ rel: 'canonical', href: `${origin}/s/${store.value.handle}` }],
})
useSeoMeta(storeMeta({
  origin,
  handle: store.value.handle,
  storeName: store.value.name,
  tagline: brand.value?.tagline ?? null,
  imageUrl: products.value[0]?.image_url ?? null,
}))

// The merchant's palette becomes the page's tokens (falls back to system tokens per key).
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
        <DofText role="title" as="h1">{{ store.name }}</DofText>
        <nav aria-label="store" class="flex gap-4 text-caption text-foreground/80">
          <a href="#shelf" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">Shop</a>
        </nav>
      </div>
    </header>

    <main class="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-10">
      <section class="flex flex-col gap-2">
        <DofText role="headline" as="p">{{ brand?.tagline ?? `Welcome to ${store.name}.` }}</DofText>
        <DofText role="caption" class="text-foreground/70">dof.dev/{{ store.handle }}</DofText>
      </section>

      <section id="shelf" aria-label="products" class="flex flex-col gap-4">
        <template v-if="products.length > 0">
          <ul class="grid list-none grid-cols-2 gap-4 p-0 regular:grid-cols-3">
            <li v-for="product in products" :key="product.id">
              <NuxtLink
                :to="`/s/${store.handle}/p/${product.id}`"
                class="dof-interactive flex flex-col gap-2 rounded-large border border-foreground/10 bg-foreground/[0.03] p-3 transition-colors hover:border-foreground/25 focus-visible:focus-ring"
              >
                <img
                  v-if="product.image_url"
                  :src="product.image_url"
                  :alt="product.image_alt ?? product.title"
                  class="h-28 w-full rounded-medium object-cover"
                  loading="lazy"
                >
                <div v-else class="flex h-28 items-center justify-center rounded-medium bg-accent/10 text-caption text-foreground/60" aria-hidden="true">
                  {{ store.name }}
                </div>
                <DofText role="body" as="h2" class="truncate font-medium">{{ product.title }}</DofText>
                <DofMoney v-if="product.price_minor !== null" :amount="product.price_minor" :currency="product.currency ?? 'EUR'" class="text-body" />
              </NuxtLink>
            </li>
          </ul>
        </template>
        <DofEmptyState
          v-else
          icon="store"
          title="The shelves are being stocked"
          :why="`${store.name} just opened — check back soon.`"
        />
      </section>
    </main>

    <footer class="border-t border-foreground/10">
      <div class="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 text-caption text-foreground/60">
        <span>{{ store.name }}</span>
        <span>powered by DOF</span>
      </div>
    </footer>
  </div>
</template>
