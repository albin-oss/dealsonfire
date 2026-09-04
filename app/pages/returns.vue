<script setup lang="ts">
/**
 * /returns (SV-3) — "What needs my decision?" A queue that projects the return state machine
 * (requested → authorized → resolved / declined), newest first, grouped so the actionable
 * cases lead. It does NOT re-implement the decision buttons — authorize/decline/resolve live
 * on the order (Orders owns the per-order bench); each case doors there. Minimum disclosure:
 * the queue names the order and the reason, never the buyer's details.
 */
import { computed, watch } from 'vue'
import { DofText, DofButton, DofEmptyState, DofSkeleton, DofStatus, DofMoney, DofTime } from '@ds/index'
import { useDevHeaders } from '../composables/dev-headers'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Returns — DOF' })

const headers = useDevHeaders()
const { data: workspace } = useFetch<{ businesses: Array<{ business_id: string; stores: Array<{ enforcement_hold: string }> }> }>(
  '/api/v1/workspace', { lazy: true, server: false, headers })
const businessId = computed(() => workspace.value?.businesses[0]?.business_id ?? null)
const hold = computed(() => workspace.value?.businesses[0]?.stores[0]?.enforcement_hold ?? null)

interface ReturnRow {
  id: string; order_id: string; state: string; reason_code: string | null; tracking_ref: string | null
  refund_minor: number; resolved_without_return: boolean; line_count: number; created_at: string
}
const { data, pending, refresh } = useFetch<{ items: ReturnRow[] }>(
  () => `/api/v1/returns?business_id=${businessId.value}`,
  { lazy: true, server: false, headers, immediate: false })
watch(businessId, (id) => { if (id) void refresh() }, { immediate: true })

const REASONS: Record<string, string> = {
  not_as_described: 'Not as described', damaged: 'Arrived damaged', wrong_item: 'Wrong item',
  changed_mind: 'Changed their mind', other: 'Other reason',
}
const all = computed(() => data.value?.items ?? [])
const needsResponse = computed(() => all.value.filter((r) => r.state === 'requested'))
const onTheWay = computed(() => all.value.filter((r) => r.state === 'authorized'))
const done = computed(() => all.value.filter((r) => r.state === 'resolved' || r.state === 'declined'))

function stateStatus(r: ReturnRow): { tone: 'positive' | 'caution' | 'neutral'; label: string } {
  if (r.state === 'requested') return { tone: 'caution', label: 'Needs your response' }
  if (r.state === 'authorized') return { tone: 'neutral', label: 'On its way back' }
  if (r.state === 'declined') return { tone: 'neutral', label: 'Declined' }
  return { tone: 'positive', label: r.resolved_without_return ? 'Refunded' : 'Resolved' }
}
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
    <PageHeader title="Returns" subtitle="What needs your decision." />
    <StoreHoldNotice :hold="hold" />

    <div v-if="pending && !data" class="flex flex-col gap-3" aria-hidden="true">
      <DofSkeleton v-for="n in 2" :key="n" class="h-16 rounded-large" />
    </div>

    <DofEmptyState
      v-else-if="all.length === 0"
      icon="rotate-ccw"
      title="No returns — that’s a good sign"
      why="When a buyer asks to return something, it lands here so you can respond. Nothing needs you right now."
    />

    <template v-else>
      <section v-if="needsResponse.length" aria-label="needs your response" class="flex flex-col gap-2">
        <DofText role="emphasis" as="h2">
          {{ needsResponse.length === 1 ? '1 return needs your response' : `${needsResponse.length} returns need your response` }}
        </DofText>
        <ul class="flex list-none flex-col gap-2 p-0">
          <li v-for="r in needsResponse" :key="r.id" class="flex flex-wrap items-center justify-between gap-3 rounded-large border border-caution/40 bg-caution/5 p-4">
            <div class="flex min-w-0 flex-col gap-0.5">
              <DofText role="emphasis" as="h3">{{ REASONS[r.reason_code ?? 'other'] }}</DofText>
              <DofText role="caption" tone="muted">{{ r.line_count }} {{ r.line_count === 1 ? 'item' : 'items' }} · asked <DofTime :value="r.created_at" /></DofText>
            </div>
            <NuxtLink to="/orders" class="contents"><DofButton size="sm" tone="accent">Review in Orders</DofButton></NuxtLink>
          </li>
        </ul>
      </section>

      <section v-if="onTheWay.length" aria-label="on the way back" class="flex flex-col gap-2">
        <DofText role="emphasis" as="h2">On its way back</DofText>
        <ul class="flex list-none flex-col gap-2 p-0">
          <li v-for="r in onTheWay" :key="r.id" class="flex flex-wrap items-center justify-between gap-3 rounded-large border border-line p-4">
            <div class="flex min-w-0 flex-col gap-0.5">
              <DofText role="body" class="font-medium">{{ REASONS[r.reason_code ?? 'other'] }}</DofText>
              <DofText role="caption" tone="muted">
                {{ r.tracking_ref ? `Tracking ${r.tracking_ref}` : 'Awaiting the parcel' }} · asked <DofTime :value="r.created_at" />
              </DofText>
            </div>
            <div class="flex items-center gap-3">
              <DofStatus v-bind="stateStatus(r)" />
              <NuxtLink to="/orders" class="contents"><DofButton size="sm" variant="soft" tone="neutral">Open</DofButton></NuxtLink>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="done.length" aria-label="recent history" class="flex flex-col gap-2">
        <DofText role="emphasis" as="h2">Done</DofText>
        <ul class="flex list-none flex-col gap-2 p-0">
          <li v-for="r in done" :key="r.id" class="flex flex-wrap items-center justify-between gap-3 rounded-large border border-line p-4">
            <div class="flex min-w-0 flex-col gap-0.5">
              <DofText role="body">{{ REASONS[r.reason_code ?? 'other'] }}</DofText>
              <DofText role="caption" tone="muted"><DofTime :value="r.created_at" /></DofText>
            </div>
            <div class="flex items-center gap-3">
              <DofText v-if="r.refund_minor > 0" role="caption" tone="muted">refunded <DofMoney :amount="r.refund_minor" currency="EUR" /></DofText>
              <DofStatus v-bind="stateStatus(r)" />
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
