<script setup lang="ts">
/**
 * /checkout (Commerce Foundation C3 — UI contract R3.6): single column, one quiet
 * progression (contact → delivery → review → pay), no upsells, no account wall.
 * The attempt key is minted once per cart in sessionStorage — refreshes, double
 * taps, and dead networks all converge on the same single order (A7-2).
 */
import { computed, ref, watch } from 'vue'
import { DofText, DofButton, DofChip, DofInput, DofMoney, DofSkeleton, DofProblem, DofEmptyState, announce } from '@ds/index'
import type { CartsResponse, CartView } from '@contracts/schemas/orders/cart.schema'
import type { CheckoutResponse } from '@contracts/schemas/orders/checkout.schema'
import type { AddressValue } from '../components/AddressFields.vue'

definePageMeta({ layout: false })
useHead({ title: 'Checkout — DOF', htmlAttrs: { 'data-scope': 'marketplace' } })

const route = useRoute()
const router = useRouter()
const cartId = computed(() => String(route.query.cart ?? ''))

const { data, pending } = await useFetch<CartsResponse>('/api/v1/public/cart', { lazy: true, server: false })
const cart = computed<CartView | null>(() =>
  (data.value?.carts ?? []).find((c) => c.cart_id === cartId.value && c.lines.some((l) => l.available)) ?? null)
const lines = computed(() => cart.value?.lines.filter((l) => l.available) ?? [])

// C6 — the store's shipping terms (display math only; the server's quote is the truth)
const { data: shippingTerms, refresh: refreshShipping } = useFetch<{ handling_days: number; flat_rate_minor: number; free_over_minor: number | null; pickup_enabled: boolean }>(
  () => `/api/v1/public/stores/${cart.value?.store_handle}/shipping`,
  { lazy: true, server: false, immediate: false },
)
watch(cart, (c) => { if (c) void refreshShipping() })
const method = ref<'ship' | 'pickup'>('ship')
const shippingMinor = computed(() => {
  if (!shippingTerms.value || method.value === 'pickup') return 0
  const t = shippingTerms.value
  if (t.free_over_minor !== null && (cart.value?.subtotal_minor ?? 0) >= t.free_over_minor) return 0
  return t.flat_rate_minor
})
const totalMinor = computed(() => (cart.value?.subtotal_minor ?? 0) + shippingMinor.value)

const contact = ref({ name: '', email: '' })
const delivery = ref<AddressValue>({ line1: '', city: '', postal_code: '', country: 'BE' })
const formComplete = computed(() =>
  contact.value.name.trim().length > 0 && /.+@.+\..+/.test(contact.value.email) &&
  (method.value === 'pickup' || (
    delivery.value.line1.trim().length > 0 && delivery.value.city.trim().length > 0 &&
    delivery.value.postal_code.trim().length > 0 && delivery.value.country.trim().length === 2)))

// the idempotency spine, client half: one key per cart, surviving refreshes
function attemptKey(): string {
  const storageKey = `dof.checkout-attempt.${cartId.value}`
  let key = window.sessionStorage.getItem(storageKey)
  if (!key) { key = crypto.randomUUID(); window.sessionStorage.setItem(storageKey, key) }
  return key
}

const placing = ref(false)
const problem = ref<{ code: string; detail: string } | null>(null)
async function placeOrder() {
  if (!formComplete.value || !cart.value || placing.value) return
  placing.value = true
  problem.value = null
  try {
    const res = await $fetch<CheckoutResponse>('/api/v1/public/checkout', {
      method: 'POST',
      body: { attempt_key: attemptKey(), cart_id: cart.value.cart_id, contact: contact.value, method: method.value, ...(method.value === 'ship' ? { delivery: delivery.value } : {}) },
    })
    if (res.ok) {
      window.sessionStorage.removeItem(`dof.checkout-attempt.${cartId.value}`)
      announce('Your order is placed.')
      await router.push(`/o/${res.order_id}?welcome=1`)
    } else {
      // a failed attempt key is spent — the next try is a fresh attempt
      if (res.code !== 'ATTEMPT_FAILED') window.sessionStorage.removeItem(`dof.checkout-attempt.${cartId.value}`)
      problem.value = res
    }
  } catch {
    problem.value = { code: 'NETWORK', detail: 'That didn’t go through — nothing was charged. Check your connection and try again; this exact order won’t be duplicated.' }
  } finally {
    placing.value = false
  }
}
</script>

<template>
  <div class="min-h-dvh bg-surface font-ui text-foreground">
    <header class="border-b border-foreground/10">
      <div class="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-4">
        <DofText role="title" as="h1">Checkout</DofText>
        <NuxtLink v-if="cart" :to="`/s/${cart.store_handle}`" class="dof-interactive rounded-small px-1 text-caption text-foreground/70 focus-visible:focus-ring">
          {{ cart.store_name }}
        </NuxtLink>
      </div>
    </header>

    <main class="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8">
      <div v-if="pending && !cart" class="flex flex-col gap-3" aria-hidden="true">
        <DofSkeleton v-for="n in 3" :key="n" class="h-24 rounded-large" />
      </div>

      <template v-else-if="cart">
        <!-- ——— the things (photos, not rows — R3.6/IA §6) -->
        <section aria-label="your order" class="flex flex-col gap-3">
          <ul class="flex list-none flex-col gap-3 p-0">
            <li v-for="line in lines" :key="line.variant_id" class="flex items-center gap-3">
              <PublicImg v-if="line.image_url" :src="line.image_url" :alt="line.image_alt ?? line.product_title" img-class="size-14 shrink-0 rounded-medium object-cover" />
              <div class="flex min-w-0 flex-1 flex-col">
                <DofText role="body" class="truncate font-medium">{{ line.product_title }}</DofText>
                <DofText v-if="line.option_label" role="caption" tone="muted">{{ line.option_label }} · {{ line.quantity }}×</DofText>
                <DofText v-else role="caption" tone="muted">{{ line.quantity }}×</DofText>
              </div>
              <DofMoney v-if="line.price_minor !== null" :amount="line.price_minor * line.quantity" :currency="line.currency ?? 'EUR'" class="shrink-0 font-medium" />
            </li>
          </ul>
        </section>

        <!-- ——— who it's for -->
        <section aria-label="contact" class="flex flex-col gap-3">
          <DofText role="emphasis" as="h2">Where should we reach you?</DofText>
          <DofInput v-model="contact.name" label="Your name" autocomplete="name" :maxlength="120" />
          <DofInput v-model="contact.email" label="Email" type="email" hint="Order updates land here — no account needed." autocomplete="email" :maxlength="254" />
        </section>

        <!-- ——— how it travels (C6: pickup where the store offers it) -->
        <section v-if="shippingTerms?.pickup_enabled" aria-label="delivery method" class="flex flex-col gap-2">
          <DofText role="emphasis" as="h2">How would you like it?</DofText>
          <div class="flex gap-2" role="group" aria-label="delivery method">
            <DofChip label="Ship it to me" :selected="method === 'ship'" selectable @toggle="method = 'ship'" />
            <DofChip label="I’ll pick it up" :selected="method === 'pickup'" selectable @toggle="method = 'pickup'" />
          </div>
        </section>

        <!-- ——— where it's going -->
        <section v-if="method === 'ship'" aria-label="delivery" class="flex flex-col gap-3">
          <DofText role="emphasis" as="h2">Where is it going?</DofText>
          <AddressFields v-model="delivery" />
        </section>

        <!-- ——— the money, visible math (R3.1) -->
        <section aria-label="total" class="flex flex-col gap-2 rounded-large border border-foreground/10 bg-foreground/[0.02] p-4">
          <div class="flex items-baseline justify-between">
            <DofText role="body" tone="muted">Subtotal</DofText>
            <DofMoney v-if="cart.currency" :amount="cart.subtotal_minor" :currency="cart.currency" />
          </div>
          <div class="flex items-baseline justify-between">
            <DofText role="body" tone="muted">{{ method === 'pickup' ? 'Pickup' : 'Shipping' }}</DofText>
            <DofText v-if="shippingMinor === 0" role="body" tone="muted">{{ method === 'pickup' ? 'Free — you collect it' : 'Free' }}</DofText>
            <DofMoney v-else-if="cart.currency" :amount="shippingMinor" :currency="cart.currency" />
          </div>
          <div class="flex items-baseline justify-between border-t border-foreground/10 pt-2">
            <DofText role="body" class="font-medium">Total</DofText>
            <DofMoney v-if="cart.currency" :amount="totalMinor" :currency="cart.currency" class="text-title font-semibold" />
          </div>
        </section>

        <DofProblem v-if="problem" title="Nothing was charged" :detail="problem.detail">
          <NuxtLink v-if="problem.code === 'CART_CHANGED' || problem.code === 'OUT_OF_STOCK'" to="/cart" class="contents">
            <DofButton size="sm" variant="soft" tone="neutral">Back to your cart</DofButton>
          </NuxtLink>
        </DofProblem>

        <!-- ——— the commitment (DP-3/DP-4: consequence named above, keystone beside) -->
        <section aria-label="place order" class="flex flex-col gap-3">
          <DofButton tone="accent" size="lg" icon="check" class="w-full" :disabled="!formComplete" :loading="placing" @click="placeOrder">
            Place order<template v-if="cart.currency"> — <DofMoney :amount="totalMinor" :currency="cart.currency" /></template>
          </DofButton>
          <KeystoneNote />
        </section>
      </template>

      <DofEmptyState
        v-else-if="!pending"
        icon="package"
        title="Nothing here to check out"
        why="Your cart may have changed — everything you added is still saved there."
        heading-as="h2"
      >
        <NuxtLink to="/cart" class="contents"><DofButton tone="accent">Back to your cart</DofButton></NuxtLink>
      </DofEmptyState>
    </main>
  </div>
</template>
