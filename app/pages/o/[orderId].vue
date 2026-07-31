<script setup lang="ts">
/**
 * /orders/:orderId (Commerce Foundation C3) — the letter, not a receipt (SM-3):
 * what happens next, in whose hands, then the story so far. Composed like
 * correspondence — the one place in commerce where slowing down is right.
 * Buyer-gated by the visitor identity; someone else's order is a 404.
 */
import { computed, ref } from 'vue'
import { DofText, DofMoney, DofButton, DofSkeleton, DofTime, DofInput, announce } from '@ds/index'
import type { BuyerOrderResponse } from '@contracts/schemas/orders/checkout.schema'

definePageMeta({ layout: false })
useHead({ title: 'Your order — DOF', htmlAttrs: { 'data-scope': 'marketplace' } })

const route = useRoute()
const orderId = computed(() => String(route.params.orderId ?? ''))
const justPlaced = computed(() => route.query.welcome === '1')

const { data, pending, error } = await useFetch<BuyerOrderResponse>(
  () => `/api/v1/public/orders/${encodeURIComponent(orderId.value)}`,
  { lazy: true, server: false },
)
const order = computed(() => data.value?.order ?? null)
const lines = computed(() => data.value?.lines ?? [])
const timeline = computed(() => data.value?.timeline ?? [])

// R3.4 — the one status vocabulary, dot + words
const STATUS: Record<string, { label: string; positive?: boolean }> = {
  placed: { label: 'Order placed' },
  payment_pending: { label: 'Payment settling' },
  payment_failed: { label: 'Payment needs another try' },
  confirmed: { label: 'Confirmed — being made ready' },
  in_fulfillment: { label: 'Getting ready' },
  partially_fulfilled: { label: 'Partly on its way' },
  fulfilled: { label: 'On its way' },
  completed: { label: 'Delivered', positive: true },
  cancelled: { label: 'Cancelled' },
}
const status = computed(() => STATUS[order.value?.state ?? ''] ?? { label: order.value?.state ?? '' })

// The letter speaks from where the order actually IS — a shipped order must never
// still be promising to tell you when it ships (copy law: never say the untrue).
const LETTER: Record<string, string> = {
  placed: 'has your order — we’ll tell you the moment it’s confirmed, and again when it ships.',
  payment_pending: 'has your order — we’ll tell you the moment your payment settles.',
  payment_failed: 'is holding your order — the payment needs another try before anything is made ready.',
  confirmed: 'has your order and is making it ready — we’ll tell you the moment it ships.',
  in_fulfillment: 'is making your order ready — we’ll tell you the moment it ships.',
  partially_fulfilled: 'has sent part of your order — we’ll tell you when the rest follows.',
  fulfilled: 'has sent your order on its way.',
  completed: 'sent this to you, and it arrived.',
  cancelled: 'cancelled this order — nothing is owed.',
}
const letterLine = computed(() => LETTER[order.value?.state ?? ''] ?? 'has your order.')

// C8 — cancel: the tap decides while nothing packed; afterwards the maker does.
// Destructive = the armed two-tap idiom (R2.1), 3s disarm.
const cancellable = computed(() =>
  !!order.value && ['confirmed', 'in_fulfillment', 'partially_fulfilled'].includes(order.value.state) && !order.value.cancel_requested)
const cancelArmed = ref(false)
let disarmTimer: ReturnType<typeof setTimeout> | null = null
const cancelling = ref(false)
async function cancelOrder() {
  if (!cancelArmed.value) {
    cancelArmed.value = true
    if (disarmTimer) clearTimeout(disarmTimer)
    disarmTimer = setTimeout(() => (cancelArmed.value = false), 3000)
    return
  }
  if (cancelling.value) return
  cancelling.value = true
  try {
    const res = await $fetch<{ outcome: string; detail?: string }>(`/api/v1/public/orders/${orderId.value}/cancel`, { method: 'POST' })
    if (res.outcome === 'cancelled') announce('Cancelled — your money is on its way back.')
    else if (res.outcome === 'requested') announce('You asked to cancel — the maker decides, and you will see the answer here.')
    else announce(res.detail ?? 'This order cannot be cancelled anymore.')
    await refreshNuxtData()
    window.location.reload()
  } catch {
    announce('That didn’t take — nothing changed; try again.')
  } finally {
    cancelling.value = false
    cancelArmed.value = false
  }
}

// C9 — returns: open once things have arrived; the maker answers here.
const REASONS = [
  { code: 'not_as_described', label: 'Not as described' },
  { code: 'damaged', label: 'Arrived damaged' },
  { code: 'wrong_item', label: 'Wrong item' },
  { code: 'changed_mind', label: 'Changed my mind' },
  { code: 'other', label: 'Something else' },
] as const
const returnCase = computed(() => data.value?.return_case ?? null)
const returnable = computed(() =>
  !!order.value && !returnCase.value
  && ['fulfilled', 'partially_fulfilled', 'completed'].includes(order.value.state)
  && lines.value.some((l) => l.line_state === 'fulfilled'))
const returnOpen = ref(false)
const returnReason = ref<string>('')
const returnComment = ref('')
const returnLines = ref<number[]>([])
const returnBusy = ref(false)
function toggleReturnLine(lineNo: number) {
  returnLines.value = returnLines.value.includes(lineNo)
    ? returnLines.value.filter((n) => n !== lineNo)
    : [...returnLines.value, lineNo]
}
async function requestReturn() {
  if (!returnReason.value || returnBusy.value) return
  returnBusy.value = true
  try {
    await $fetch(`/api/v1/public/orders/${orderId.value}/return`, {
      method: 'POST',
      body: {
        reason_code: returnReason.value,
        comment: returnComment.value.trim() || null,
        ...(returnLines.value.length ? { line_nos: returnLines.value } : {}),
      },
    })
    announce('Asked — the maker takes a look and answers right here.')
    window.location.reload()
  } catch (e) {
    const detail = (e as { data?: { detail?: string } }).data?.detail
    announce(detail ?? 'That didn’t take — nothing changed; try again.')
    returnBusy.value = false
  }
}
const returnTracking = ref('')
async function sendReturnTracking() {
  if (!returnTracking.value.trim() || returnBusy.value) return
  returnBusy.value = true
  try {
    await $fetch(`/api/v1/public/orders/${orderId.value}/return`, {
      method: 'POST', body: { tracking_ref: returnTracking.value.trim() },
    })
    announce('Noted — the maker sees it’s on the way back.')
    window.location.reload()
  } catch {
    announce('That didn’t take — nothing changed; try again.')
    returnBusy.value = false
  }
}
</script>

<template>
  <div class="min-h-dvh bg-surface font-ui text-foreground">
    <header class="border-b border-foreground/10">
      <div class="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-4">
        <DofText role="title" as="h1">Your order</DofText>
        <nav aria-label="site" class="flex gap-4 text-caption text-foreground/80">
          <NuxtLink to="/o" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">All orders</NuxtLink>
          <NuxtLink to="/home" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">Today</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10">
      <div v-if="pending && !order" class="flex flex-col gap-3" aria-hidden="true">
        <DofSkeleton v-for="n in 3" :key="n" class="h-24 rounded-large" />
      </div>

      <template v-else-if="order">
        <!-- ——— the letter (reading rhythm, generous space) -->
        <section aria-label="the letter" class="flex flex-col gap-4">
          <DofText v-if="justPlaced" role="headline" as="p" reading>It’s on its way to being yours.</DofText>
          <div class="flex items-center gap-2">
            <span class="inline-block size-2 rounded-full" :class="status.positive ? 'bg-positive' : 'bg-accent'" aria-hidden="true" />
            <DofText role="emphasis" as="p">{{ status.label }}</DofText>
          </div>
          <DofText role="body" class="max-w-prose text-foreground/90" reading>
            <NuxtLink :to="`/s/${order.store_handle}`" class="dof-interactive rounded-small font-medium underline-offset-4 hover:underline focus-visible:focus-ring">{{ order.store_name }}</NuxtLink>
            {{ letterLine }} Everything below stays right here, on any device.
          </DofText>
          <!-- the maker's sign-off (SM-3): their standing promise, in their words -->
          <DofText v-if="data?.maker_promise" role="caption" class="text-positive">
            ✓ {{ data!.maker_promise }} — {{ order.store_name }}
          </DofText>
        </section>

        <!-- ——— the story so far -->
        <section aria-label="story" class="flex flex-col gap-3">
          <OrderTimeline :entries="timeline" :store-name="order.store_name" />
        </section>

        <!-- ——— the Workshop Wait (SX-1): the maker's real week, while you wait -->
        <section v-if="(data?.wait_sparks?.length ?? 0) > 0" aria-label="from the workshop while you wait" class="flex flex-col gap-2 rounded-large border border-foreground/10 bg-foreground/[0.02] p-4">
          <DofText role="caption" class="uppercase tracking-widest text-accent">Meanwhile, in the workshop</DofText>
          <ul class="flex list-none flex-col gap-3 p-0">
            <li v-for="sp in data!.wait_sparks" :key="sp.id" class="flex items-start gap-3">
              <PublicImg v-if="sp.image_url" :src="sp.image_url" alt="" img-class="size-12 shrink-0 rounded-medium object-cover" />
              <div class="flex min-w-0 flex-col gap-0.5">
                <DofText role="body" class="text-foreground/90">{{ sp.body }}</DofText>
                <DofText role="caption" class="text-foreground/50"><DofTime :value="sp.published_at" mode="relative" /></DofText>
              </div>
            </li>
          </ul>
        </section>

        <!-- ——— the things -->
        <section aria-label="what you ordered" class="flex flex-col gap-3 rounded-large border border-foreground/10 bg-foreground/[0.02] p-4">
          <ul class="flex list-none flex-col gap-3 p-0">
            <li v-for="line in lines" :key="line.line_no" class="flex items-center gap-3">
              <NuxtLink :to="`/s/${order.store_handle}/p/${line.product_id}`" class="dof-interactive shrink-0 rounded-medium focus-visible:focus-ring">
                <PublicImg v-if="line.image_url" :src="line.image_url" :alt="line.title" img-class="size-14 rounded-medium object-cover" />
                <div v-else class="flex size-14 items-center justify-center rounded-medium bg-accent/10 text-caption text-foreground/50" aria-hidden="true">·</div>
              </NuxtLink>
              <div class="flex min-w-0 flex-1 flex-col">
                <DofText role="body" class="truncate font-medium">{{ line.title }}</DofText>
                <DofText role="caption" tone="muted">{{ line.option_label ? `${line.option_label} · ` : '' }}{{ line.quantity }}×</DofText>
              </div>
              <DofMoney :amount="line.unit_price_minor * line.quantity" :currency="order.currency" class="shrink-0" />
            </li>
          </ul>
          <div class="flex items-baseline justify-between border-t border-foreground/10 pt-3">
            <DofText role="body" class="font-medium">Total</DofText>
            <DofMoney :amount="order.total_minor" :currency="order.currency" class="font-semibold" />
          </div>
        </section>

        <!-- ——— where it's going (two calm lines — R3.7) -->
        <section aria-label="delivery" class="flex flex-col gap-1">
          <DofText role="caption" tone="muted">{{ order.delivery_method === 'pickup' ? 'Pickup' : 'Going to' }}</DofText>
          <template v-if="order.delivery_method === 'pickup'">
            <DofText role="body">You’re picking it up at {{ order.store_name }} — they’ll tell you here when it’s ready.</DofText>
          </template>
          <template v-else>
            <DofText role="body">{{ order.contact_name }} · {{ order.delivery.line1 }}</DofText>
            <DofText role="body" tone="muted">{{ order.delivery.postal_code }} {{ order.delivery.city }}, {{ order.delivery.country }}</DofText>
          </template>
          <DofText role="caption" class="mt-1 text-foreground/50">Order {{ order.order_number }} · placed <DofTime :value="order.placed_at" mode="relative" /></DofText>
        </section>

        <!-- ——— cancel (C8): quiet, honest, armed -->
        <div v-if="cancellable" class="flex items-center gap-2">
          <DofButton size="sm" :variant="cancelArmed ? 'soft' : 'ghost'" :tone="cancelArmed ? 'critical' : 'neutral'" icon="x" :loading="cancelling" @click="cancelOrder">
            {{ cancelArmed ? 'Really cancel this order?' : 'Cancel this order' }}
          </DofButton>
          <DofText role="caption" class="text-foreground/50">
            Not packed yet? It cancels instantly. Already moving? The maker decides.
          </DofText>
        </div>
        <DofText v-else-if="order.cancel_requested" role="caption" class="text-foreground/60">
          You asked to cancel — {{ order.store_name }} decides, and the answer lands right here.
        </DofText>

        <!-- ——— returns (C9): opens once things arrive; the maker answers here -->
        <section v-if="returnable" aria-label="send something back" class="flex flex-col gap-3">
          <DofButton v-if="!returnOpen" size="sm" variant="ghost" tone="neutral" icon="rotate-ccw" @click="returnOpen = true">
            Send something back
          </DofButton>
          <div v-else class="flex flex-col gap-3 rounded-large border border-foreground/10 bg-foreground/[0.02] p-4">
            <DofText role="emphasis" as="p">What’s bringing it back?</DofText>
            <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="reason">
              <button
                v-for="r in REASONS" :key="r.code" type="button" role="radio" :aria-checked="returnReason === r.code"
                class="dof-interactive rounded-full border px-3 py-1.5 text-caption focus-visible:focus-ring"
                :class="returnReason === r.code ? 'border-accent bg-accent/10 font-medium text-foreground' : 'border-foreground/15 text-foreground/80'"
                @click="returnReason = r.code"
              >{{ r.label }}</button>
            </div>
            <template v-if="lines.filter((l) => l.line_state === 'fulfilled').length > 1">
              <DofText role="caption" tone="muted">Which things? (leave empty for everything delivered)</DofText>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="l in lines.filter((x) => x.line_state === 'fulfilled')" :key="l.line_no" type="button"
                  :aria-pressed="returnLines.includes(l.line_no)"
                  class="dof-interactive rounded-full border px-3 py-1.5 text-caption focus-visible:focus-ring"
                  :class="returnLines.includes(l.line_no) ? 'border-accent bg-accent/10 font-medium text-foreground' : 'border-foreground/15 text-foreground/80'"
                  @click="toggleReturnLine(l.line_no)"
                >{{ l.title }}</button>
              </div>
            </template>
            <DofInput v-model="returnComment" label="Anything the maker should know? (optional)" :maxlength="500" />
            <div class="flex items-center gap-2">
              <DofButton size="sm" tone="accent" :disabled="!returnReason" :loading="returnBusy" @click="requestReturn">Ask to send it back</DofButton>
              <DofButton size="sm" variant="ghost" tone="neutral" @click="returnOpen = false">Never mind</DofButton>
            </div>
            <DofText role="caption" class="text-foreground/50">The maker takes a look and answers right here — nothing ships until they say where.</DofText>
          </div>
        </section>

        <section v-else-if="returnCase" aria-label="your return" class="flex flex-col gap-2 rounded-large border border-foreground/10 bg-foreground/[0.02] p-4">
          <template v-if="returnCase.state === 'requested'">
            <DofText role="body">You asked to send something back — {{ order.store_name }} takes a look and answers here.</DofText>
          </template>
          <template v-else-if="returnCase.state === 'authorized'">
            <DofText role="body" class="font-medium">{{ order.store_name }} says: send it back.</DofText>
            <DofText v-if="returnCase.instructions" role="body" class="text-foreground/80" reading>“{{ returnCase.instructions }}”</DofText>
            <template v-if="!returnCase.tracking_ref">
              <div class="flex items-end gap-2">
                <DofInput v-model="returnTracking" label="Tracking for the send-back (optional)" :maxlength="120" class="flex-1" />
                <DofButton size="sm" variant="soft" tone="neutral" :loading="returnBusy" @click="sendReturnTracking">Add</DofButton>
              </div>
            </template>
            <DofText v-else role="caption" class="text-foreground/60">On its way back — tracking {{ returnCase.tracking_ref }}.</DofText>
          </template>
          <template v-else-if="returnCase.state === 'resolved'">
            <DofText role="body" class="text-positive">Your return is settled — the refund line above is the receipt.</DofText>
          </template>
          <template v-else-if="returnCase.state === 'declined'">
            <DofText role="body" class="text-foreground/80">{{ order.store_name }} looked at this return and is keeping the order as delivered — the note in the story says why.</DofText>
          </template>
        </section>

        <!-- ——— the door (R1.5) -->
        <NuxtLink :to="`/s/${order.store_handle}`" class="dof-interactive mx-auto rounded-small px-1 text-caption text-foreground/60 underline-offset-4 hover:underline focus-visible:focus-ring">
          More from {{ order.store_name }} →
        </NuxtLink>
      </template>

      <div v-else-if="error" class="flex flex-col items-center gap-3 py-12">
        <DofText role="body" tone="muted">This order doesn’t exist — or it belongs to a different device.</DofText>
        <NuxtLink to="/home" class="contents"><DofButton variant="soft" tone="neutral">Back to the street</DofButton></NuxtLink>
      </div>
    </main>
  </div>
</template>
