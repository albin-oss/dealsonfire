<script setup lang="ts">
/**
 * /shipping (SV-3) — "How will this order reach the buyer?" The detailed home for the ONE
 * shipping profile (the same truth /store summarises and checkout charges — never a second
 * settings system). Four honest fields: handling days, price, free-over threshold, pickup.
 * Alongside them, the promises buyers actually see, derived from the same numbers plus DOF's
 * 30-day returns standard — so the merchant sees exactly what they're promising.
 */
import { computed, ref, watch } from 'vue'
import { DofText, DofButton, DofInput, DofChip, DofSkeleton, DofProblem, announce } from '@ds/index'
import { useDevHeaders } from '../composables/dev-headers'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Shipping — DOF' })

const headers = useDevHeaders()
const { data: workspace } = useFetch<{ businesses: Array<{ business_id: string; stores: Array<{ store_id: string; handle: string; enforcement_hold: string }> }> }>(
  '/api/v1/workspace', { lazy: true, server: false, headers })
const store = computed(() => workspace.value?.businesses[0]?.stores[0] ?? null)
const hold = computed(() => store.value?.enforcement_hold ?? null)

const loaded = ref(false)
const handling = ref('3')
const flat = ref('0')
const freeOver = ref('')
const pickup = ref(false)
const returnDays = ref<number | null>(null)
const saving = ref(false)
const saved = ref(false)
const problem = ref('')

watch(store, async (s) => {
  if (!s) return
  try {
    const t = await $fetch<{ handling_days: number; flat_rate_minor: number; free_over_minor: number | null; pickup_enabled: boolean; return_window_days: number }>(
      `/api/v1/public/stores/${s.handle}/shipping`)
    handling.value = String(t.handling_days)
    flat.value = String(t.flat_rate_minor / 100)
    freeOver.value = t.free_over_minor === null ? '' : String(t.free_over_minor / 100)
    pickup.value = t.pickup_enabled
    returnDays.value = t.return_window_days
  } catch { /* defaults stand */ } finally { loaded.value = true }
}, { immediate: true })

const flatNum = computed(() => Math.max(0, Number(flat.value) || 0))
const freeOverNum = computed(() => (freeOver.value.trim() === '' ? null : Math.max(0, Number(freeOver.value) || 0)))
// the buyer-facing promise, derived from the same numbers checkout uses
const shippingLine = computed(() => {
  const parts: string[] = []
  parts.push(flatNum.value === 0 ? 'Free shipping' : `€${flatNum.value.toFixed(2)} shipping`)
  if (flatNum.value > 0 && freeOverNum.value != null) parts.push(`free over €${freeOverNum.value.toFixed(2)}`)
  return parts.join(', ')
})

async function save() {
  if (!store.value || saving.value) return
  saving.value = true; saved.value = false; problem.value = ''
  try {
    await $fetch(`/api/v1/stores/${store.value.store_id}/shipping`, {
      method: 'PUT',
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
      body: {
        handling_days: Math.max(0, Math.min(60, Number(handling.value) || 0)),
        flat_rate_minor: Math.round(flatNum.value * 100),
        free_over_minor: freeOverNum.value == null ? null : Math.round(freeOverNum.value * 100),
        pickup_enabled: pickup.value,
      },
    })
    saved.value = true
    announce('Shipping saved — new orders carry the new promise.')
  } catch (e) {
    problem.value = (e as { data?: { detail?: string } }).data?.detail ?? 'That didn’t save — try again.'
  } finally { saving.value = false }
}
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
    <PageHeader title="Shipping" subtitle="How your orders reach buyers." />
    <StoreHoldNotice :hold="hold" />

    <div v-if="!loaded" class="flex flex-col gap-3" aria-hidden="true">
      <DofSkeleton v-for="n in 2" :key="n" class="h-16 rounded-large" />
    </div>

    <template v-else-if="store">
      <section aria-label="shipping settings" class="flex flex-col gap-3 rounded-large border border-line p-4">
        <div class="grid gap-3 regular:grid-cols-3">
          <DofInput v-model="handling" label="Handling days" hint="From confirmed to shipped." :maxlength="2" />
          <DofInput v-model="flat" label="Shipping price (€)" hint="0 = free shipping." :maxlength="6" />
          <DofInput v-model="freeOver" label="Free over (€)" hint="Blank = no threshold." :maxlength="7" />
        </div>
        <DofChip label="Offer pickup at the shop" :selected="pickup" selectable @toggle="pickup = !pickup" />
        <DofProblem v-if="problem" title="Couldn’t save" :detail="problem" />
        <div class="flex items-center gap-3">
          <DofButton size="sm" tone="accent" icon="check" :loading="saving" @click="save">Save shipping</DofButton>
          <DofText v-if="saved" role="caption" class="text-positive">Saved — new orders promise it.</DofText>
        </div>
      </section>

      <section aria-label="what buyers see" class="flex flex-col gap-2 rounded-large border border-line bg-surface-raised p-4">
        <DofText role="emphasis" as="h2">What buyers see</DofText>
        <ul class="flex list-none flex-col gap-1 p-0 text-body text-foreground/85">
          <li>· {{ shippingLine }}<span v-if="pickup"> · pickup available</span></li>
          <li>· Ships within {{ handling || '0' }} {{ Number(handling) === 1 ? 'day' : 'days' }} of an order</li>
          <li v-if="returnDays">· Returns accepted within {{ returnDays }} days of delivery — DOF’s standard promise</li>
        </ul>
        <DofText role="caption" tone="muted">This is exactly what checkout charges and what your storefront shows.</DofText>
      </section>
    </template>

    <DofEmptyState
      v-else
      icon="truck"
      title="Your store goes here first"
      why="Shipping settings belong to a store. Open yours with Ignite, then set how orders travel."
    >
      <NuxtLink to="/ignite" class="contents"><DofButton tone="accent">Start Ignite</DofButton></NuxtLink>
    </DofEmptyState>
  </div>
</template>
