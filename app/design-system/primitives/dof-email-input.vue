<script setup lang="ts">
/** DofEmailInput — email entry with the right keyboard, autocomplete, and semantics preset. */
import type { Size } from '../types'
import DofInput from './dof-input.vue'

const model = defineModel<string>({ default: '' })

withDefaults(defineProps<{
  label: string
  description?: string
  error?: string
  required?: boolean
  size?: Size
  disabled?: boolean
  placeholder?: string
}>(), { size: 'md', disabled: false })
</script>

<template>
  <DofInput
    v-model="model"
    :label :description :error :required :size :disabled :placeholder
    type="email"
    inputmode="email"
    autocomplete="email"
  />
</template>
