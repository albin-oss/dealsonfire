<script setup lang="ts">
/**
 * DofMoney — THE money renderer (DESIGN-SYSTEM-001 DS-10). Takes integer minor units
 * (the platform's bigint money law, ADR-004 rule 8) and renders locale-correct major
 * units via Intl. Bible §4.3: money renders as money — €1,240, never 124000, and
 * never 1240.00 when the cents are zero. Tabular numerals always.
 * No other component may format currency; check that at review, not runtime.
 */
import { computed } from 'vue'
import { cx } from '../utils/cx'

const props = withDefaults(defineProps<{
  /** Integer minor units (e.g. 1499 for €14.99). */
  amount: number
  /** ISO 4217 code (EUR, USD, JPY…). */
  currency: string
  locale?: string
  /** Exact mode forces full precision — anything the merchant signs (payouts, fees). */
  exact?: boolean
  /** Strikethrough style for compare-at/original prices. */
  struck?: boolean
}>(), { locale: undefined, exact: false, struck: false })

const parts = computed(() => {
  if (!Number.isInteger(props.amount)) {
    throw new Error(`DofMoney received a non-integer amount (${props.amount}) — money is integer minor units (send 1499 for €14.99)`)
  }
  const probe = new Intl.NumberFormat(props.locale, { style: 'currency', currency: props.currency })
  const exponent = probe.resolvedOptions().maximumFractionDigits ?? 2
  const factor = 10 ** exponent
  const major = props.amount / factor
  const wholeAmount = props.amount % factor === 0
  const formatter = new Intl.NumberFormat(props.locale, {
    style: 'currency',
    currency: props.currency,
    minimumFractionDigits: wholeAmount && !props.exact ? 0 : exponent,
    maximumFractionDigits: exponent,
  })
  return { text: formatter.format(major), major }
})
</script>

<template>
  <data
    :value="`${amount} ${currency}`"
    :class="cx('font-numeric tabular-nums whitespace-nowrap', struck && 'line-through text-faint-foreground')"
  >{{ parts.text }}</data>
</template>
