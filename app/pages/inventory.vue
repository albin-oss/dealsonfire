<script setup lang="ts">
/**
 * /inventory (SV-3) — "What can I sell right now?" Not a spreadsheet: variants that need
 * attention (out of stock, running low) rise to the top; the rest stay quiet. Stock is the
 * one authoritative number (available = on-hand minus what checkouts hold) — there is no
 * UI-side count. Setting a number turns tracking on; ±buttons correct it. Untracked variants
 * are honestly "always available", with one tap to start counting.
 */
import { computed, reactive, ref, watch } from 'vue'
import { DofText, DofButton, DofNumberInput, DofEmptyState, DofSkeleton, DofProblem, DofStatus, announce } from '@ds/index'
import { useDevHeaders } from '../composables/dev-headers'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Inventory — DOF' })

const headers = useDevHeaders()
const { data: workspace } = useFetch<{ businesses: Array<{ business_id: string; stores: Array<{ enforcement_hold: string }> }> }>(
  '/api/v1/workspace', { lazy: true, server: false, headers })
const businessId = computed(() => workspace.value?.businesses[0]?.business_id ?? null)
const hold = computed(() => workspace.value?.businesses[0]?.stores[0]?.enforcement_hold ?? null)

interface Row {
  product_id: string; title: string; variant_id: string; sku: string; option_values: Record<string, unknown>
  tracked: boolean; on_hand: number | null; reserved: number; available: number | null
}
const { data, pending, refresh } = useFetch<{ items: Row[] }>(
  () => `/api/v1/inventory?business_id=${businessId.value}`,
  { lazy: true, server: false, headers, immediate: false })
watch(businessId, (id) => { if (id) void refresh() }, { immediate: true })

const optionLabel = (v: Record<string, unknown>) => Object.values(v ?? {}).filter(Boolean).join(' · ')

// exception-first: out of stock, then low (≤3), then other tracked, then untracked
function rank(r: Row): number {
  if (r.tracked && (r.available ?? 0) <= 0) return 0
  if (r.tracked && (r.available ?? 0) <= 3) return 1
  if (r.tracked) return 2
  return 3
}
const rows = computed(() => [...(data.value?.items ?? [])].sort((a, b) => rank(a) - rank(b)))
const needAttention = computed(() => rows.value.filter((r) => r.tracked && (r.available ?? 0) <= 3).length)

// per-row edit state (variant_id → { value, busy, error, open })
const edit = reactive<Record<string, { value: number | null; busy: boolean; error: string; open: boolean }>>({})
function beginEdit(r: Row) {
  edit[r.variant_id] = { value: r.tracked ? r.on_hand : 0, busy: false, error: '', open: true }
}
async function save(r: Row) {
  const e = edit[r.variant_id]; if (!e || e.busy || e.value == null) return
  e.busy = true; e.error = ''
  try {
    await $fetch(`/api/v1/inventory/${r.variant_id}`, {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
      body: { business_id: businessId.value, mode: 'set', quantity: e.value },
    })
    e.open = false
    await refresh()
    announce(`${r.title} stock set to ${e.value}.`)
  } catch (err) {
    e.error = (err as { data?: { detail?: string } }).data?.detail ?? 'That didn’t save — try again.'
  } finally { e.busy = false }
}
const busyRow = (id: string) => edit[id]?.busy ?? false

function statusFor(r: Row): { tone: 'positive' | 'caution' | 'critical' | 'neutral'; label: string } {
  if (!r.tracked) return { tone: 'neutral', label: 'Always available' }
  const a = r.available ?? 0
  if (a <= 0) return { tone: 'critical', label: 'Out of stock' }
  if (a <= 3) return { tone: 'caution', label: `${a} left` }
  return { tone: 'positive', label: `${a} available` }
}
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
    <PageHeader title="Inventory" subtitle="What you can sell right now." />
    <StoreHoldNotice :hold="hold" />

    <div v-if="pending && !data" class="flex flex-col gap-3" aria-hidden="true">
      <DofSkeleton v-for="n in 3" :key="n" class="h-16 rounded-large" />
    </div>

    <DofEmptyState
      v-else-if="rows.length === 0"
      icon="layers"
      title="Nothing to count yet"
      why="Inventory follows your products. Add your first product and it shows up here, ready to track."
    >
      <NuxtLink to="/products" class="contents"><DofButton tone="accent">Add a product</DofButton></NuxtLink>
    </DofEmptyState>

    <template v-else>
      <DofText v-if="needAttention > 0" role="body" class="text-foreground/80">
        {{ needAttention === 1 ? '1 item needs attention' : `${needAttention} items need attention` }}.
      </DofText>

      <ul class="flex list-none flex-col gap-2 p-0">
        <li v-for="r in rows" :key="r.variant_id" class="flex flex-col gap-2 rounded-large border border-line p-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex min-w-0 flex-col gap-0.5">
              <DofText role="emphasis" as="h2" class="truncate">{{ r.title }}</DofText>
              <DofText v-if="optionLabel(r.option_values)" role="caption" tone="muted">{{ optionLabel(r.option_values) }}</DofText>
              <DofText role="caption" tone="muted">SKU {{ r.sku }}</DofText>
            </div>
            <div class="flex items-center gap-3">
              <DofStatus :tone="statusFor(r).tone" :label="statusFor(r).label" />
              <DofButton v-if="!edit[r.variant_id]?.open" size="sm" variant="soft" tone="neutral" @click="beginEdit(r)">
                {{ r.tracked ? 'Update stock' : 'Track stock' }}
              </DofButton>
            </div>
          </div>
          <DofText v-if="r.tracked && r.reserved > 0" role="caption" tone="muted">
            {{ r.reserved }} in progress in buyers’ baskets right now.
          </DofText>

          <div v-if="edit[r.variant_id]?.open" class="flex flex-col gap-2 border-t border-line pt-3">
            <div class="flex flex-wrap items-end gap-3">
              <DofNumberInput v-model="edit[r.variant_id]!.value" label="On hand" :min="0" integer class="w-32" />
              <DofButton size="sm" tone="accent" icon="check" :loading="busyRow(r.variant_id)" @click="save(r)">Save</DofButton>
              <DofButton size="sm" variant="ghost" tone="neutral" @click="edit[r.variant_id]!.open = false">Cancel</DofButton>
            </div>
            <DofText v-if="!r.tracked" role="caption" tone="muted">
              Saving a number starts tracking this item — buyers can’t buy more than you have.
            </DofText>
            <DofProblem v-if="edit[r.variant_id]?.error" title="Couldn’t save" :detail="edit[r.variant_id]!.error" />
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>
