<script setup lang="ts">
/**
 * DofTime — THE date/time renderer (DESIGN-SYSTEM-001 DS-10). Emits a real <time>
 * element with a machine datetime; humans get locale-correct text. Relative mode
 * picks the largest sensible unit ("3 hours ago") and is deterministic per render
 * (no self-updating interval by default — SSR-safe and test-stable; pass `now` to pin).
 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  value: Date | string
  mode?: 'date' | 'datetime' | 'time' | 'relative'
  locale?: string
  timeZone?: string
  /** Reference instant for relative mode (defaults to render time). */
  now?: Date
}>(), { mode: 'datetime' })

const date = computed(() => {
  const d = props.value instanceof Date ? props.value : new Date(props.value)
  if (Number.isNaN(d.getTime())) throw new Error(`DofTime received an invalid date: ${String(props.value)}`)
  return d
})
const iso = computed(() => date.value.toISOString())
// eager validation: a bad value fails at mount, not at first paint of a child binding
void date.value

const RELATIVE_STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000_000], ['month', 2_592_000_000], ['week', 604_800_000],
  ['day', 86_400_000], ['hour', 3_600_000], ['minute', 60_000],
]

const text = computed(() => {
  const d = date.value
  if (props.mode === 'relative') {
    const delta = d.getTime() - (props.now ?? new Date()).getTime()
    const rtf = new Intl.RelativeTimeFormat(props.locale, { numeric: 'auto' })
    for (const [unit, ms] of RELATIVE_STEPS) {
      if (Math.abs(delta) >= ms) return rtf.format(Math.trunc(delta / ms), unit)
    }
    return rtf.format(Math.trunc(delta / 1000), 'second')
  }
  const options: Intl.DateTimeFormatOptions =
    props.mode === 'date' ? { dateStyle: 'medium' }
    : props.mode === 'time' ? { timeStyle: 'short' }
    : { dateStyle: 'medium', timeStyle: 'short' }
  return new Intl.DateTimeFormat(props.locale, { ...options, timeZone: props.timeZone }).format(d)
})
</script>

<template>
  <time :datetime="iso" class="font-numeric tabular-nums">{{ text }}</time>
</template>
