<script setup lang="ts">
/**
 * AddressFields (UI contract R3.7) — the ONE address form: autocomplete-friendly,
 * minimal required set, never split into steps. v-model carries the whole address.
 */
import { computed } from 'vue'
import { DofInput } from '@ds/index'

export interface AddressValue { line1: string; city: string; postal_code: string; country: string }

const props = defineProps<{ modelValue: AddressValue }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: AddressValue): void }>()

const field = (key: keyof AddressValue) => computed({
  get: () => props.modelValue[key],
  set: (value: string) => emit('update:modelValue', { ...props.modelValue, [key]: key === 'country' ? value.toUpperCase() : value }),
})
const line1 = field('line1')
const city = field('city')
const postal = field('postal_code')
const country = field('country')
</script>

<template>
  <div class="flex flex-col gap-3">
    <DofInput v-model="line1" label="Street and number" autocomplete="address-line1" :maxlength="200" />
    <div class="grid grid-cols-2 gap-3">
      <DofInput v-model="postal" label="Postal code" autocomplete="postal-code" :maxlength="20" />
      <DofInput v-model="city" label="City" autocomplete="address-level2" :maxlength="120" />
    </div>
    <DofInput v-model="country" label="Country" hint="Two letters — BE, NL, DE…" autocomplete="country" :maxlength="2" />
  </div>
</template>
