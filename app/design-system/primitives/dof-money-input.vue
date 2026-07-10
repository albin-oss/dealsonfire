<script setup lang="ts">
/**
 * DofMoneyInput — THE money entry (the write-side twin of DofMoney, DS-10).
 * Model is INTEGER MINOR UNITS (the platform's money law, ADR-004 rule 8) or null;
 * the merchant types major units ("14.99") and the component owns the conversion via
 * the currency's Intl exponent. Invalid text keeps the field (work is never lost),
 * sets model null, and educates via the standard hint (i18n). Blur normalizes the
 * display to the canonical form.
 */
import { computed, ref, watch } from 'vue'
import { useDsMessages } from '../i18n'
import type { Size } from '../types'
import DofInput from './dof-input.vue'

const model = defineModel<number | null>({ default: null })

const props = withDefaults(defineProps<{
  label: string
  /** ISO 4217 — drives the minor-unit exponent and the prefix symbol. */
  currency: string
  description?: string
  error?: string
  required?: boolean
  size?: Size
  locale?: string
  disabled?: boolean
}>(), { size: 'md', disabled: false })

const messages = useDsMessages()

const exponent = computed(() =>
  new Intl.NumberFormat(props.locale, { style: 'currency', currency: props.currency })
    .resolvedOptions().maximumFractionDigits ?? 2)

const symbol = computed(() =>
  new Intl.NumberFormat(props.locale, { style: 'currency', currency: props.currency })
    .formatToParts(0).find((p) => p.type === 'currency')?.value ?? props.currency)

function toText(minor: number | null): string {
  if (minor === null) return ''
  return (minor / 10 ** exponent.value).toFixed(exponent.value)
}

const text = ref(toText(model.value))
const invalid = ref(false)

watch(model, (value) => {
  const parsed = parseMinor(text.value)
  // unparseable text is the merchant mid-thought — never clobber it (work is never lost)
  if (parsed !== undefined && parsed !== value) text.value = toText(value)
})
watch(() => props.currency, () => { text.value = toText(model.value) })

function parseMinor(raw: string): number | null | undefined {
  const trimmed = raw.trim().replace(',', '.')
  if (trimmed === '') return null
  if (!/^\d+(\.\d*)?$/.test(trimmed)) return undefined // undefined = unparseable
  const minor = Math.round(Number(trimmed) * 10 ** exponent.value)
  return Number.isSafeInteger(minor) ? minor : undefined
}

function commit() {
  const parsed = parseMinor(text.value)
  if (parsed === undefined) {
    invalid.value = true
    model.value = null // never emit a guess for money
    return
  }
  invalid.value = false
  model.value = parsed
  text.value = toText(parsed)
}

const shownError = computed(() => props.error ?? (invalid.value ? messages.input.moneyHint : undefined))
</script>

<template>
  <DofInput
    v-model="text"
    :label :description :required :size :disabled
    :error="shownError"
    inputmode="decimal"
    @blur="commit"
    @keydown.enter="commit"
  >
    <template #prefix>
      <span class="font-numeric tabular-nums" aria-hidden="true">{{ symbol }}</span>
    </template>
  </DofInput>
</template>
