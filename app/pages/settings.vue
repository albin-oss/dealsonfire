<script setup lang="ts">
/**
 * Settings — grows its first real card in C10 Slice 3: GETTING PAID. The walk to
 * the bank teller's window (Stripe-hosted onboarding — "they ask the legal
 * questions; DOF never sees your papers"), the till's status in street words,
 * and the way back when the payment partner needs something. A banking
 * restriction closes only the checkout door; the storefront stays on the street.
 */
import { computed, ref, watch, onMounted } from 'vue'
import { DofText, DofCard, DofButton, DofSkeleton, DofIcon, DofMoney, announce } from '@ds/index'
import { useDevHeaders } from '../composables/dev-headers'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Settings — DOF' })

const headers = useDevHeaders()
const route = useRoute()
const { data: workspace } = useFetch<{ businesses: Array<{ business_id: string }> }>('/api/v1/workspace', {
  lazy: true, server: false, headers,
})
const businessId = computed(() => workspace.value?.businesses[0]?.business_id ?? null)

interface MoneyStory {
  currency: string
  waiting_minor: number
  ready_minor: number
  set_aside_minor: number
  paid_minor: number
  min_minor: number
  interval_days: number
  next_due_at: string | null
  history: Array<{ amount_minor: number; at: string; provider_payout_id: string; status: 'on_its_way' | 'arrived' | 'needs_another_try' }>
}
interface PayStatus { onboarding_state: string; charges_enabled: boolean; payouts_enabled: boolean; provider: string; money: MoneyStory }
const status = ref<PayStatus | null>(null)
const loading = ref(true)
const walking = ref(false)

async function loadStatus(sync = false) {
  if (!businessId.value) return
  loading.value = true
  try {
    status.value = await $fetch<PayStatus>(`/api/v1/businesses/${businessId.value}/payments${sync ? '?sync=1' : ''}`, { headers })
  } finally {
    loading.value = false
  }
}
watch(businessId, (id) => {
  // the onboarding return path syncs the snapshot from the provider
  if (id) void loadStatus(route.query.stripe === 'return')
}, { immediate: true })
onMounted(() => {
  if (route.query.stripe === 'return') announce('Welcome back — checking your banking status.')
})

async function startOnboarding() {
  if (!businessId.value || walking.value) return
  walking.value = true
  try {
    const res = await $fetch<{ url: string }>(`/api/v1/businesses/${businessId.value}/payments/onboarding`, {
      method: 'POST', headers: { ...headers, 'idempotency-key': crypto.randomUUID() }, body: {},
    })
    window.location.href = res.url
  } catch {
    announce('That didn’t take — try again.')
    walking.value = false
  }
}

const tillLine = computed(() => {
  if (!status.value) return ''
  if (status.value.charges_enabled) return 'Your till is open — buyers can check out, and money becomes ready for payout when orders ship.'
  if (status.value.onboarding_state === 'none') return 'One walk to the bank teller’s window and your till opens. Stripe asks the legal questions — DOF never sees your papers.'
  if (status.value.onboarding_state === 'submitted') return 'Your details are with the payment partner — the till opens the moment they say yes. Nothing more to do right now.'
  return 'Your banking setup isn’t finished — pick up where you left off and the till opens on its own.'
})

// C11 S2 — the money story (Merchant Experience Validation §2–§4): three numbers,
// one rhythm, zero accounting words. Presentation only; the domain computed it all.
const money = computed(() => status.value?.money ?? null)
const hasMoneyStory = computed(() =>
  !!money.value && (money.value.waiting_minor > 0 || money.value.ready_minor > 0
    || money.value.set_aside_minor > 0 || money.value.history.length > 0))
const PAYOUT_STATUS_WORDS: Record<string, string> = {
  on_its_way: 'on its way to your bank',
  arrived: 'arrived',
  needs_another_try: 'needs another try',
}
const payoutDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
    <PageHeader title="Settings" subtitle="The quiet machinery behind your shop." />

    <DofCard>
      <div class="flex flex-col gap-3 p-1">
        <div class="flex items-center gap-2">
          <DofIcon name="store" class="text-accent" />
          <DofText role="emphasis" as="h2">Getting paid</DofText>
        </div>
        <DofSkeleton v-if="loading && !status" class="h-12 rounded-medium" aria-hidden="true" />
        <template v-else-if="status">
          <div class="flex items-center gap-2">
            <span class="inline-block size-2 rounded-full" :class="status.charges_enabled ? 'bg-positive' : 'bg-caution'" aria-hidden="true" />
            <DofText role="body" class="font-medium">{{ status.charges_enabled ? 'Till open' : 'Till not open yet' }}</DofText>
          </div>
          <DofText role="body" class="max-w-prose text-foreground/80" reading>{{ tillLine }}</DofText>
          <div v-if="!status.charges_enabled" class="flex items-center gap-2">
            <DofButton tone="accent" icon="store" :loading="walking" @click="startOnboarding">
              {{ status.onboarding_state === 'none' ? 'Set up payouts with Stripe' : 'Continue with Stripe' }}
            </DofButton>
          </div>
          <!-- C11 S2: the money story — three numbers, one rhythm, zero accounting -->
          <div v-if="hasMoneyStory && money" class="flex flex-col gap-2 border-t border-foreground/10 pt-3">
            <div class="flex flex-wrap gap-x-6 gap-y-1">
              <div class="flex flex-col">
                <DofText role="caption" tone="muted">Waiting on deliveries</DofText>
                <DofMoney :amount="money.waiting_minor" :currency="money.currency" class="font-medium" />
              </div>
              <div class="flex flex-col">
                <DofText role="caption" tone="muted">Ready for your next payout</DofText>
                <DofMoney :amount="money.ready_minor" :currency="money.currency" class="font-semibold" />
              </div>
              <div class="flex flex-col">
                <DofText role="caption" tone="muted">Paid to your bank so far</DofText>
                <DofMoney :amount="money.paid_minor" :currency="money.currency" class="font-medium" />
              </div>
            </div>
            <DofText v-if="money.set_aside_minor > 0" role="caption" class="text-caution">
              <DofMoney :amount="money.set_aside_minor" :currency="money.currency" /> is set aside while a bank
              question about a payment is settled — it comes back to you when it’s answered.
            </DofText>
            <DofText v-if="money.ready_minor > 0 && money.ready_minor < money.min_minor" role="caption" class="text-foreground/60">
              Small amounts wait until they reach <DofMoney :amount="money.min_minor" :currency="money.currency" />, then travel together.
            </DofText>
            <DofText role="caption" class="text-foreground/50">
              Waiting money becomes yours once things ship and the quiet week passes. Payouts go out about
              {{ money.interval_days === 7 ? 'once a week' : `every ${money.interval_days} days` }}.
            </DofText>
            <ul v-if="money.history.length > 0" class="flex list-none flex-col gap-1 p-0 pt-1" aria-label="your payouts">
              <li v-for="p in money.history" :key="p.provider_payout_id">
                <DofText role="caption" class="text-foreground/80">
                  <DofMoney :amount="p.amount_minor" :currency="money.currency" /> → your bank ·
                  {{ PAYOUT_STATUS_WORDS[p.status] }} · {{ payoutDate(p.at) }}
                </DofText>
              </li>
            </ul>
          </div>
          <DofText role="caption" class="text-foreground/50">
            Your storefront stays on the street either way — only the checkout door waits for the banking.
          </DofText>
        </template>
      </div>
    </DofCard>
  </div>
</template>
