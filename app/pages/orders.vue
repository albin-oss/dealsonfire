<script setup lang="ts">
/**
 * /orders — the merchant's promises in progress (Commerce Foundation C5;
 * THE_DOF_WORKSHOP §2, the binding verdict: parcels and promise language,
 * NEVER a status table). Confirmed orders lead (A7-8 — the merchant sees
 * certainty); the first sale ever gets its once-ever moment (MM-2): the
 * buyer's reality first, the money quietly, the craft as the star.
 */
import { computed, ref, onMounted, watch } from 'vue'
import { DofText, DofCard, DofMoney, DofTime, DofSkeleton, DofEmptyState, DofIcon, DofButton, DofInput, announce } from '@ds/index'
import { useDevHeaders } from '../composables/dev-headers'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Orders — DOF' })

const headers = useDevHeaders()
const { data: workspace } = useFetch<{ businesses: Array<{ business_id: string }> }>('/api/v1/workspace', {
  lazy: true, server: false, headers,
})
const businessId = computed(() => workspace.value?.businesses[0]?.business_id ?? null)

interface MerchantOrder {
  id: string; order_number: string; state: string; placed_at: string
  buyer_name: string; buyer_email: string
  delivery: { line1: string; city: string; postal_code: string; country: string }
  total_minor: number; currency: string
  promise_ship_by: string | null; aging_stage: number; delivery_method: string; hold_released_at: string | null
  items: Array<{ title: string; option_label: string | null; quantity: number; line_state: string }>
}
const { data, pending, refresh } = useFetch<{ items: MerchantOrder[] }>(
  () => `/api/v1/orders?business_id=${businessId.value}`,
  { lazy: true, server: false, headers, immediate: false },
)
watch(businessId, (id) => { if (id) void refresh() }, { immediate: true })
const orders = computed(() => data.value?.items ?? [])
const confirmed = computed(() => orders.value.filter((o) => o.state === 'confirmed'))

// MM-2 — the first sale, once ever on this device (the Moment Ledger's humble start)
const FIRST_SALE_SEEN = 'dof.moment.first-sale-seen'
const momentDismissed = ref(true)
onMounted(() => { momentDismissed.value = window.localStorage.getItem(FIRST_SALE_SEEN) === '1' })
const firstSaleMoment = computed(() =>
  !momentDismissed.value && confirmed.value.length === 1 ? confirmed.value[0]! : null)
function keepMoment() {
  window.localStorage.setItem(FIRST_SALE_SEEN, '1')
  momentDismissed.value = true
}

// C6 — the bench actions: pack (photo optional), dispatch (tracking optional)
const busyOrder = ref<string | null>(null)
const tracking = ref<Record<string, { carrier: string; ref: string }>>({})
const trackingFor = (id: string) => (tracking.value[id] ??= { carrier: '', ref: '' })
async function act(o: MerchantOrder, action: 'pack' | 'dispatch' | 'collected') {
  if (busyOrder.value) return
  busyOrder.value = o.id
  try {
    const body = action === 'dispatch'
      ? { carrier: trackingFor(o.id).carrier.trim() || null, tracking_ref: trackingFor(o.id).ref.trim() || null }
      : {}
    await $fetch(`/api/v1/orders/${o.id}/${action}`, { method: 'POST', headers: { ...headers, 'idempotency-key': crypto.randomUUID() }, body })
    announce(action === 'pack' ? 'Packed.' : action === 'dispatch' ? 'On its way — the buyer knows.' : 'Handed over.')
    await refresh()
  } catch {
    announce('That didn’t take — try again.')
  } finally {
    busyOrder.value = null
  }
}
const promiseDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : null
const actionable = (o: MerchantOrder) => ['confirmed', 'in_fulfillment', 'partially_fulfilled'].includes(o.state)
const moneyLine = (o: MerchantOrder) =>
  o.hold_released_at ? 'payout on its way'
  : o.state === 'fulfilled' ? 'yours — payout follows delivery settling'
  : 'in your balance — payable when it ships'

// R3.4 status words, merchant chair: promises, not statuses
const STATE_LINE: Record<string, string> = {
  placed: 'settling — confirmed any moment now',
  payment_pending: 'payment settling',
  payment_failed: 'payment needs another try',
  confirmed: 'to make ready',
  cancelled: 'cancelled — nothing owed',
}
const itemsLine = (o: MerchantOrder) =>
  o.items.filter((i) => i.line_state !== 'cancelled')
    .map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ''}${i.title}${i.option_label ? ` (${i.option_label})` : ''}`)
    .join(' · ')
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
    <PageHeader title="Orders" subtitle="Every order is a promise — here's what's in your hands." />

    <!-- ——— MM-2: the first sale (once, ever; the ember at its calmest) -->
    <DofCard v-if="firstSaleMoment" class="border-accent/30 bg-accent/5">
      <div class="flex flex-col gap-2 p-1">
        <div class="flex items-center gap-2">
          <DofIcon name="flame" class="text-ember" />
          <DofText role="emphasis" as="h2">Someone just bought {{ itemsLine(firstSaleMoment) }}.</DofText>
        </div>
        <DofText role="body" class="text-foreground/90" reading>
          It's your first sale. {{ firstSaleMoment.buyer_name }} is waiting —
          <DofMoney :amount="firstSaleMoment.total_minor" :currency="firstSaleMoment.currency" /> is in your balance,
          and it becomes payable the moment you ship.
        </DofText>
        <button type="button" class="dof-interactive self-start rounded-small text-caption text-foreground/60 underline-offset-4 hover:underline focus-visible:focus-ring" @click="keepMoment">
          Keep this moment
        </button>
      </div>
    </DofCard>

    <div v-if="pending && orders.length === 0" class="flex flex-col gap-3" aria-hidden="true">
      <DofSkeleton v-for="n in 2" :key="n" class="h-24 rounded-large" />
    </div>

    <section v-else-if="orders.length > 0" aria-label="your promises" class="flex flex-col gap-3">
      <ul class="flex list-none flex-col gap-3 p-0">
        <li v-for="o in orders" :key="o.id">
          <DofCard>
            <div class="flex flex-col gap-1.5 p-1">
              <div class="flex items-baseline justify-between gap-2">
                <DofText role="body" class="min-w-0 truncate font-medium">{{ itemsLine(o) || '—' }}</DofText>
                <DofMoney :amount="o.total_minor" :currency="o.currency" class="shrink-0 font-medium" />
              </div>
              <DofText role="caption" tone="muted">
                for {{ o.buyer_name }} · {{ STATE_LINE[o.state] ?? o.state }} · placed <DofTime :value="o.placed_at" mode="relative" />
              </DofText>
              <!-- ORR-C1: everything needed to pack the parcel, on the card itself -->
              <div v-if="o.state === 'confirmed'" class="flex flex-col gap-0.5 border-t border-foreground/10 pt-1.5">
                <DofText role="caption" class="text-foreground/80">
                  Ship to: {{ o.delivery.line1 }}, {{ o.delivery.postal_code }} {{ o.delivery.city }}, {{ o.delivery.country }}
                </DofText>
                <DofText role="caption" tone="muted">
                  Reach {{ o.buyer_name }} at <a :href="`mailto:${o.buyer_email}`" class="dof-interactive rounded-small underline-offset-4 hover:underline focus-visible:focus-ring">{{ o.buyer_email }}</a>
                </DofText>
                <DofText v-if="o.promise_ship_by" role="caption" :class="o.aging_stage >= 1 ? 'text-caution' : 'text-foreground/80'">
                  {{ o.delivery_method === 'pickup' ? 'Ready' : 'Ship' }} by {{ promiseDate(o.promise_ship_by) }} — your promise to {{ o.buyer_name }}
                </DofText>
                <DofText role="caption" tone="muted"><DofMoney :amount="o.total_minor" :currency="o.currency" /> {{ moneyLine(o) }}</DofText>
              </div>
              <!-- the calm nudge (aging stage 1): a question, never an alarm -->
              <DofText v-if="o.aging_stage >= 1 && actionable(o)" role="caption" class="rounded-medium bg-caution/10 px-2 py-1 text-caution">
                Did this ship? Mark it below — {{ o.buyer_name }}’s protection kicks in soon if the promise stays open.
              </DofText>
              <!-- the bench actions -->
              <div v-if="actionable(o)" class="flex flex-col gap-2 border-t border-foreground/10 pt-2">
                <div v-if="o.delivery_method !== 'pickup'" class="flex flex-wrap items-end gap-2">
                  <DofInput v-model="trackingFor(o.id).carrier" label="Carrier" placeholder="bpost" class="w-28" :maxlength="60" />
                  <DofInput v-model="trackingFor(o.id).ref" label="Tracking (optional)" placeholder="BE-123…" class="w-40" :maxlength="120" />
                  <DofButton size="sm" tone="accent" icon="truck" :loading="busyOrder === o.id" @click="act(o, 'dispatch')">It shipped</DofButton>
                  <DofButton size="sm" variant="soft" tone="neutral" icon="package" :loading="busyOrder === o.id" @click="act(o, 'pack')">Packed</DofButton>
                </div>
                <div v-else class="flex flex-wrap gap-2">
                  <DofButton size="sm" tone="accent" icon="store" :loading="busyOrder === o.id" @click="act(o, 'dispatch')">Ready for pickup</DofButton>
                  <DofButton size="sm" variant="soft" tone="neutral" icon="check" :loading="busyOrder === o.id" @click="act(o, 'collected')">Handed over</DofButton>
                </div>
              </div>
            </div>
          </DofCard>
        </li>
      </ul>
    </section>

    <DofEmptyState
      v-else-if="!pending && businessId"
      icon="package"
      title="Your first order lands here"
      why="When someone buys from your store, it arrives as a promise — who it's for, what to make ready, and when. You'll hear about it the moment money and stock are certain, never earlier."
      heading-as="h2"
    />
  </div>
</template>
