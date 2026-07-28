<script setup lang="ts">
/**
 * /cart (Commerce Foundation C1) — the buyer's working document, one section per shop
 * (a cart per store: one merchant, one promise). Re-quoted on every read: prices are
 * live truth, lines that reality hid render honestly instead of vanishing, and a price
 * that moved says so. Anonymous-first; signing in carries the cart across devices.
 */
import { computed, ref } from 'vue'
import { DofText, DofButton, DofMoney, DofSkeleton, DofEmptyState, announce } from '@ds/index'
import type { CartsResponse, CartView } from '@contracts/schemas/orders/cart.schema'

definePageMeta({ layout: false })

useHead({
  title: 'Your cart — DOF',
  htmlAttrs: { 'data-scope': 'marketplace' },
})

const { data, pending, refresh } = await useFetch<CartsResponse>('/api/v1/public/cart', {
  lazy: true, server: false,
})
const carts = computed(() => (data.value?.carts ?? []).filter((c) => c.lines.length > 0))

// line mutations: absolute quantities (idempotent by natural key), then re-read
const busyLine = ref<string | null>(null)
async function setQuantity(cart: CartView, variantId: string, quantity: number) {
  if (busyLine.value) return
  busyLine.value = variantId
  try {
    await $fetch('/api/v1/public/cart/lines', { method: 'POST', body: { variant_id: variantId, quantity } })
    if (quantity === 0) announce('Taken out of your cart.')
    await refresh()
  } catch {
    announce('That didn’t take — try again.')
  } finally {
    busyLine.value = null
  }
}

const priceMoved = (line: CartView['lines'][number]) =>
  line.available && line.price_minor !== null && line.price_seen_minor !== null && line.price_minor !== line.price_seen_minor
</script>

<template>
  <div class="min-h-dvh bg-surface font-ui text-foreground">
    <header class="border-b border-foreground/10">
      <div class="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
        <DofText role="title" as="h1">Your cart</DofText>
        <nav aria-label="site" class="flex gap-4 text-caption text-foreground/80">
          <NuxtLink to="/home" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">Today</NuxtLink>
          <NuxtLink to="/shops" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">Shops</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div v-if="pending && carts.length === 0" class="flex flex-col gap-3" aria-hidden="true">
        <DofSkeleton v-for="n in 2" :key="n" class="h-32 rounded-large" />
      </div>

      <template v-else-if="carts.length > 0">
        <section
          v-for="cart in carts" :key="cart.cart_id"
          :aria-label="`your cart at ${cart.store_name}`"
          class="flex flex-col gap-3 rounded-large border border-foreground/10 bg-foreground/[0.02] p-4"
        >
          <div class="flex items-baseline justify-between gap-2">
            <NuxtLink :to="`/s/${cart.store_handle}`" class="dof-interactive rounded-small focus-visible:focus-ring">
              <DofText role="emphasis" as="h2">{{ cart.store_name }}</DofText>
            </NuxtLink>
            <DofMoney v-if="cart.currency" :amount="cart.subtotal_minor" :currency="cart.currency" class="shrink-0 font-medium" />
          </div>

          <ul class="flex list-none flex-col gap-3 p-0">
            <li v-for="line in cart.lines" :key="line.variant_id" class="flex items-start gap-3">
              <NuxtLink :to="`/s/${cart.store_handle}/p/${line.product_id}`" class="dof-interactive shrink-0 rounded-medium focus-visible:focus-ring">
                <PublicImg v-if="line.image_url" :src="line.image_url" :alt="line.image_alt ?? line.product_title" img-class="size-16 rounded-medium object-cover" />
                <div v-else class="flex size-16 items-center justify-center rounded-medium bg-accent/10 text-caption text-foreground/50" aria-hidden="true">·</div>
              </NuxtLink>

              <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                <NuxtLink :to="`/s/${cart.store_handle}/p/${line.product_id}`" class="dof-interactive rounded-small focus-visible:focus-ring">
                  <DofText role="body" class="truncate font-medium">{{ line.product_title }}</DofText>
                </NuxtLink>
                <DofText v-if="line.option_label" role="caption" tone="muted">{{ line.option_label }}</DofText>
                <DofText v-if="!line.available" role="caption" class="text-caution">No longer available from this shop</DofText>
                <DofText v-else-if="priceMoved(line)" role="caption" tone="muted">
                  The price changed since you added it — it’s now <DofMoney :amount="line.price_minor!" :currency="line.currency ?? 'EUR'" />.
                </DofText>
              </div>

              <div class="flex shrink-0 flex-col items-end gap-1.5">
                <DofMoney v-if="line.available && line.price_minor !== null" :amount="line.price_minor * line.quantity" :currency="line.currency ?? 'EUR'" class="font-medium" />
                <div class="flex items-center gap-1" role="group" :aria-label="`quantity of ${line.product_title}`">
                  <template v-if="line.available">
                    <DofButton size="sm" variant="ghost" tone="neutral" icon="minus" :aria-label="`one less ${line.product_title}`" :disabled="busyLine !== null" @click="setQuantity(cart, line.variant_id, line.quantity - 1)" />
                    <DofText role="body" class="w-6 text-center tabular-nums" aria-live="polite">{{ line.quantity }}</DofText>
                    <DofButton size="sm" variant="ghost" tone="neutral" icon="plus" :aria-label="`one more ${line.product_title}`" :disabled="busyLine !== null || line.quantity >= 99" @click="setQuantity(cart, line.variant_id, line.quantity + 1)" />
                  </template>
                  <DofButton v-else size="sm" variant="ghost" tone="neutral" icon="x" :disabled="busyLine !== null" @click="setQuantity(cart, line.variant_id, 0)">Remove</DofButton>
                </div>
              </div>
            </li>
          </ul>

          <DofText role="caption" class="text-foreground/60">
            Checkout is almost here — everything stays saved, and your cart follows you when you sign in.
          </DofText>
        </section>
      </template>

      <DofEmptyState
        v-else-if="!pending"
        icon="package"
        title="Your cart is empty"
        why="Everything you add on the street lands here — and stays, on any device, once you sign in."
        heading-as="h2"
      >
        <NuxtLink to="/home" class="contents"><DofButton tone="accent">See what’s on the street today</DofButton></NuxtLink>
      </DofEmptyState>
    </main>

    <footer class="border-t border-foreground/10">
      <div class="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 text-caption text-foreground/60">
        <span>Independent shops, real people</span>
        <NuxtLink to="/home" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">powered by DOF</NuxtLink>
      </div>
    </footer>
  </div>
</template>
