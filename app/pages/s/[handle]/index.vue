<script setup lang="ts">
/**
 * /s/:handle — the public storefront (UX-IGNITE Phase 3). The world's view of a live
 * store: the merchant's brand palette dresses the page (the same D-34 cascade the Ignite
 * preview uses — the preview and the real thing are literally the same rendering idea),
 * the shelf shows active products, and nothing else exists. SSR so the first paint IS the
 * store (LCP budget), and links unfurl with the merchant's name.
 */
import { computed, ref } from 'vue'
import { useBrandKit, DofText, DofMoney, DofButton, DofEmptyState, announce } from '@ds/index'
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
  tagline: brand.value?.story ?? brand.value?.tagline ?? null,
  title: brand.value?.tagline ?? null,
  imageUrl: products.value[0]?.image_url ?? null,
}))

// The merchant's palette becomes the page's tokens (falls back to system tokens per key).
// ——— share this shop (Release 1.1): the story leads, the same share idiom as everywhere
const shared = ref(false)
async function shareShop() {
  const url = `${origin}/s/${store.value.handle}`
  const payload = {
    title: brand.value?.tagline ? `${store.value.name} — ${brand.value.tagline}` : store.value.name,
    text: brand.value?.story?.slice(0, 120) ?? brand.value?.tagline ?? `${store.value.name} on DOF`,
    url,
  }
  try {
    if (navigator.share) { await navigator.share(payload) }
    else { await navigator.clipboard.writeText(url); shared.value = true; setTimeout(() => (shared.value = false), 2000) }
    announce('Link ready to share.')
  } catch { /* user dismissed the sheet — nothing to do */ }
}

// ——— follow (Release 1.0): per-visitor snapshot, client-side — the storefront read stays cacheable
const { data: engagement } = useFetch<{ followers: number; viewer_follows: boolean }>(
  () => `/api/v1/public/stores/${encodeURIComponent(handle.value)}/engagement`,
  { lazy: true, server: false },
)

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
        <div class="mt-3 flex items-center gap-3">
          <DealEngage
            kind="store"
            :deal-id="store.handle"
            :store-handle="store.handle"
            :store-name="store.name"
            :fires="0"
            :reacted="false"
            :follows="engagement?.viewer_follows ?? false"
            variant="full"
          />
          <DofButton variant="soft" tone="neutral" size="sm" icon="share-2" @click="shareShop">
            {{ shared ? 'Link copied' : 'Share this shop' }}
          </DofButton>
          <DofText v-if="(engagement?.followers ?? 0) > 0" role="caption" class="text-foreground/70">
            {{ engagement!.followers === 1 ? '1 person follows' : `${engagement!.followers} people follow` }} this store
          </DofText>
        </div>
        <a
          v-if="brand?.story"
          href="#about"
          class="dof-interactive mt-2 inline-block rounded-small px-1 text-caption text-foreground/70 underline-offset-4 hover:underline focus-visible:focus-ring"
        >Meet the maker ↓</a>
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

      <!-- ——— latest from the store (Release 0.6 — the voice) -->
      <section v-if="data && data.sparks.length > 0" aria-label="latest updates" class="flex flex-col gap-3">
        <DofText role="emphasis" as="h2">Latest from {{ store.name }}</DofText>
        <ul class="flex list-none flex-col gap-2 p-0">
          <li v-for="sp in data.sparks" :key="sp.id">
            <NuxtLink
              :to="`/s/${store.handle}/sparks/${sp.id}`"
              class="dof-interactive flex items-start gap-3 rounded-large border border-foreground/10 bg-foreground/[0.02] p-3 transition-colors hover:border-foreground/25 focus-visible:focus-ring"
            >
              <img v-if="sp.image_url" :src="sp.image_url" alt="" class="size-14 shrink-0 rounded-medium object-cover" loading="lazy">
              <DofText role="body" class="line-clamp-2 text-foreground/90">{{ sp.body }}</DofText>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <!-- ——— who we are (Release 0.5 — the identity block) -->
      <section
        v-if="brand?.story || brand?.promise"
        id="about"
        aria-label="about this store"
        class="flex flex-col gap-3 rounded-large border border-foreground/10 bg-foreground/[0.03] p-5"
      >
        <DofText role="emphasis" as="h2">About {{ store.name }}</DofText>
        <DofText v-if="brand?.story" role="body" class="max-w-prose text-foreground/90" reading>
          {{ brand.story }}
        </DofText>
        <DofText v-if="brand?.promise" role="caption" class="text-positive">✓ {{ brand.promise }}</DofText>
      </section>

      <NuxtLink to="/home" class="dof-interactive mx-auto rounded-small px-1 text-caption text-foreground/60 underline-offset-4 hover:underline focus-visible:focus-ring">
        More shops like this on DOF →
      </NuxtLink>
    </main>

    <footer class="border-t border-foreground/10">
      <div class="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 text-caption text-foreground/60">
        <span>{{ store.name }}</span>
        <NuxtLink to="/home" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">powered by DOF</NuxtLink>
      </div>
    </footer>
  </div>
</template>
