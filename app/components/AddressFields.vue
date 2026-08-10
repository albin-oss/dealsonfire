<script setup lang="ts">
/**
 * AddressFields (UI contract R3.7) — the ONE address form: autocomplete-friendly,
 * minimal required set, never split into steps. v-model carries the whole address.
 *
 * C11 (registered C10 debt): fields emit from LOCAL state, not per-field spreads
 * of the prop — same-tick multi-field updates (autofill, programmatic fills) no
 * longer lose all but the last field to stale-prop races.
 */
import { reactive, watch } from 'vue'
import { DofInput } from '@ds/index'

export interface AddressValue { line1: string; city: string; postal_code: string; country: string }

const props = defineProps<{ modelValue: AddressValue }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: AddressValue): void }>()

const local = reactive<AddressValue>({ ...props.modelValue })
watch(() => props.modelValue, (v) => Object.assign(local, v), { deep: true })
watch(local, () => {
  emit('update:modelValue', { ...local, country: local.country.toUpperCase() })
}, { deep: true })
</script>

<template>
  <div class="flex flex-col gap-3">
    <DofInput v-model="local.line1" label="Street and number" autocomplete="address-line1" :maxlength="200" />
    <div class="grid grid-cols-2 gap-3">
      <DofInput v-model="local.postal_code" label="Postal code" autocomplete="postal-code" :maxlength="20" />
      <DofInput v-model="local.city" label="City" autocomplete="address-level2" :maxlength="120" />
    </div>
    <DofInput v-model="local.country" label="Country" hint="Two letters — BE, NL, DE…" autocomplete="country" :maxlength="2" />
  </div>
</template>
