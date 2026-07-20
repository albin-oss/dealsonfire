<script setup lang="ts">
/**
 * Guided onboarding (CAP-R1-MER-002). A conversational discovery flow — Ignite asks, the
 * merchant answers, DOF tailors itself. Never feels like configuring software: one question
 * at a time, optional questions are skippable, every answer autosaves (save-and-resume), and
 * it ends by showing what DOF will do and guiding straight into business creation.
 */
import { ref, computed, onMounted } from 'vue'
import { DofText, DofButton, DofCard, DofProgress, DofRadioGroup, DofChip, DofSpinner } from '@ds/index'
import type { OnboardingProfileResponse } from '@contracts/schemas/merchant/onboarding-profile.schema'

definePageMeta({ middleware: 'auth', layout: false })
useHead({ title: 'Welcome to DOF' })

type Answers = OnboardingProfileResponse['answers']
interface Step {
  key: keyof Answers
  prompt: string
  hint?: string
  multi: boolean
  optional?: boolean
  options: { value: string; label: string }[]
}

const STEPS: Step[] = [
  { key: 'business_stage', prompt: 'Tell me a little about your business.', multi: false, options: [
    { value: 'exploring', label: 'Exploring an idea' }, { value: 'starting', label: 'Starting a new business' },
    { value: 'existing', label: 'I have an existing business' }, { value: 'established', label: 'Established company' } ] },
  { key: 'sell_types', prompt: 'What would you like to sell?', hint: 'Pick as many as fit.', multi: true, options: [
    { value: 'physical', label: 'Physical products' }, { value: 'handmade', label: 'Handmade goods' },
    { value: 'digital', label: 'Digital products' }, { value: 'services', label: 'Services' },
    { value: 'appointments', label: 'Appointments' }, { value: 'rentals', label: 'Rentals' },
    { value: 'events', label: 'Events' }, { value: 'courses', label: 'Courses' },
    { value: 'memberships', label: 'Memberships' }, { value: 'other', label: 'Something else' } ] },
  { key: 'channels', prompt: 'Where do you want to sell?', hint: 'Pick as many as fit.', multi: true, options: [
    { value: 'online', label: 'Online' }, { value: 'physical_store', label: 'Physical store' },
    { value: 'social', label: 'Social media' }, { value: 'marketplace', label: 'DOF marketplace' },
    { value: 'wholesale', label: 'Wholesale' } ] },
  { key: 'current_platform', prompt: 'Are you selling anywhere today?', multi: false, options: [
    { value: 'none', label: 'Not yet' }, { value: 'shopify', label: 'Shopify' },
    { value: 'woocommerce', label: 'WooCommerce' }, { value: 'etsy', label: 'Etsy' },
    { value: 'amazon', label: 'Amazon' }, { value: 'square', label: 'Square' }, { value: 'other', label: 'Somewhere else' } ] },
  { key: 'team_size', prompt: 'How big is your team?', multi: false, options: [
    { value: 'solo', label: 'Just me' }, { value: '2_5', label: '2–5' },
    { value: '6_20', label: '6–20' }, { value: '20_plus', label: '20+' } ] },
  { key: 'monthly_orders', prompt: 'Roughly how many orders a month?', hint: 'Optional — skip if you’re not sure.', multi: false, optional: true, options: [
    { value: 'just_starting', label: 'Just starting' }, { value: 'under_100', label: 'Under 100' },
    { value: '100_1000', label: '100–1,000' }, { value: '1000_plus', label: '1,000+' } ] },
]

const loading = ref(true)
const saving = ref(false)
const stepIndex = ref(0)
const answers = ref<Answers>({})
const recommendation = ref<OnboardingProfileResponse['recommendation'] | null>(null)
const reviewing = ref(false)

const step = computed(() => STEPS[stepIndex.value]!)
const isLast = computed(() => stepIndex.value === STEPS.length - 1)
const currentAnswered = computed(() => {
  const v = answers.value[step.value.key]
  return step.value.multi ? Array.isArray(v) && v.length > 0 : v != null
})

onMounted(async () => {
  try {
    const res = await $fetch<OnboardingProfileResponse>('/api/v1/onboarding')
    answers.value = res.answers ?? {}
    recommendation.value = res.recommendation
    // resume at the first unanswered question
    const firstGap = STEPS.findIndex((s) => {
      const v = answers.value[s.key]
      return s.optional ? false : !(s.multi ? Array.isArray(v) && v.length > 0 : v != null)
    })
    stepIndex.value = firstGap === -1 ? STEPS.length - 1 : firstGap
  } catch {
    // start fresh on any read failure — onboarding never blocks
  } finally {
    loading.value = false
  }
})

async function save(patch: Record<string, unknown>) {
  saving.value = true
  try {
    const res = await $fetch<OnboardingProfileResponse>('/api/v1/onboarding', { method: 'PUT', body: { answers: patch } })
    recommendation.value = res.recommendation
  } catch {
    // keep the local selection; a later save will reconcile
  } finally {
    saving.value = false
  }
}

function pickSingle(value?: string) {
  if (!value) return
  ;(answers.value as Record<string, unknown>)[step.value.key] = value
  save({ [step.value.key]: value })
}
function toggleMulti(value: string) {
  const key = step.value.key
  const cur = new Set((answers.value[key] as string[] | undefined) ?? [])
  cur.has(value) ? cur.delete(value) : cur.add(value)
  const next = [...cur]
  ;(answers.value as Record<string, unknown>)[key] = next
  save({ [key]: next })
}
const isSelected = (value: string): boolean => {
  const v = answers.value[step.value.key]
  return step.value.multi ? Array.isArray(v) && (v as string[]).includes(value) : v === value
}

function next() {
  if (isLast.value) { reviewing.value = true; return }
  stepIndex.value += 1
}
function back() {
  if (reviewing.value) { reviewing.value = false; return }
  if (stepIndex.value > 0) stepIndex.value -= 1
}

const finishing = ref(false)
async function createBusiness() {
  finishing.value = true
  try { await $fetch('/api/v1/onboarding/complete', { method: 'POST' }) } catch { /* proceed regardless */ }
  await navigateTo('/ignite')
}

const READINESS_LABEL = computed(() => {
  const s = recommendation.value?.marketplace_readiness_score ?? 0
  return s >= 70 ? 'Ready to sell on the marketplace' : s >= 40 ? 'Almost marketplace-ready' : 'We’ll get you marketplace-ready'
})
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-10">
    <div class="flex flex-col gap-1">
      <DofText role="headline" as="h1">Welcome to DOF</DofText>
      <DofText role="body" tone="muted">A few quick questions so I can set DOF up around your business.</DofText>
    </div>

    <div v-if="loading" class="flex flex-col items-center gap-3 py-16">
      <DofSpinner size="lg" label="Loading your onboarding" />
    </div>

    <!-- review + recommendation -->
    <DofCard v-else-if="reviewing">
      <template #header><DofText role="emphasis" as="h2">Great — here’s how I’ll tailor DOF.</DofText></template>
      <div class="flex flex-col gap-4">
        <div v-if="recommendation" class="flex flex-col gap-1">
          <DofText role="body"><strong>Suggested setup:</strong> a {{ recommendation.suggested_business_type }} business.</DofText>
          <DofText role="body" tone="muted">{{ READINESS_LABEL }} ({{ recommendation.marketplace_readiness_score }}/100).</DofText>
        </div>
        <DofText v-else role="body" tone="muted">I’ve noted your answers — let’s create your business and put them to work.</DofText>
        <div v-if="recommendation && recommendation.recommended_modules.length" class="flex flex-col gap-2">
          <DofText role="caption" tone="muted">I’ll switch these on for you:</DofText>
          <div class="flex flex-wrap gap-2">
            <DofChip v-for="m in recommendation.recommended_modules" :key="m" :label="m.replace(/_/g, ' ')" />
          </div>
        </div>
        <div class="flex items-center justify-between gap-2 pt-2">
          <DofButton variant="ghost" tone="neutral" @click="back">Back</DofButton>
          <DofButton tone="ember" icon="flame" :loading="finishing" @click="createBusiness">Create my business</DofButton>
        </div>
      </div>
    </DofCard>

    <!-- a single question -->
    <template v-else>
      <div class="flex flex-col gap-2">
        <DofProgress :value="stepIndex + 1" :max="STEPS.length" :label="`Question ${stepIndex + 1} of ${STEPS.length}`" />
        <span aria-live="polite" class="text-caption text-muted-foreground">{{ saving ? 'Saving…' : ' ' }}</span>
      </div>

      <fieldset class="flex flex-col gap-4">
        <legend class="flex flex-col gap-1">
          <DofText v-if="step.multi" role="emphasis" as="span">{{ step.prompt }}</DofText>
          <DofText v-if="step.hint" role="caption" tone="muted">{{ step.hint }}</DofText>
        </legend>

        <DofRadioGroup
          v-if="!step.multi"
          :model-value="(answers[step.key] as string | undefined)"
          :label="step.prompt"
          :options="step.options"
          @update:model-value="pickSingle"
        />
        <div v-else role="group" :aria-label="step.prompt" class="flex flex-wrap gap-2">
          <DofChip
            v-for="opt in step.options"
            :key="opt.value"
            :label="opt.label"
            selectable
            :selected="isSelected(opt.value)"
            @toggle="toggleMulti(opt.value)"
          />
        </div>
      </fieldset>

      <div class="flex items-center justify-between gap-2 pt-2">
        <DofButton variant="ghost" tone="neutral" :disabled="stepIndex === 0" @click="back">Back</DofButton>
        <div class="flex items-center gap-2">
          <DofButton v-if="step.optional && !currentAnswered" variant="ghost" tone="neutral" @click="next">Skip</DofButton>
          <DofButton tone="accent" :disabled="!currentAnswered && !step.optional" @click="next">
            {{ isLast ? 'See what DOF suggests' : 'Continue' }}
          </DofButton>
        </div>
      </div>
    </template>
  </main>
</template>
