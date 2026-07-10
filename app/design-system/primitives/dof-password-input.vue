<script setup lang="ts">
/** DofPasswordInput — DofInput with a visibility toggle (announced, keyboard-first). */
import { ref } from 'vue'
import { useDsMessages } from '../i18n'
import type { Size } from '../types'
import DofInput from './dof-input.vue'
import DofIcon from './dof-icon.vue'

const model = defineModel<string>({ default: '' })

withDefaults(defineProps<{
  label: string
  description?: string
  error?: string
  required?: boolean
  size?: Size
  autocomplete?: 'current-password' | 'new-password'
  disabled?: boolean
}>(), { size: 'md', autocomplete: 'current-password', disabled: false })

const messages = useDsMessages()
const revealed = ref(false)
</script>

<template>
  <DofInput
    v-model="model"
    :label :description :error :required :size :disabled :autocomplete
    :type="revealed ? 'text' : 'password'"
  >
    <template #suffix>
      <button
        type="button"
        class="dof-interactive -me-1 flex size-8 items-center justify-center rounded-small text-muted-foreground hover:bg-surface-sunken focus-visible:focus-ring"
        :aria-label="revealed ? messages.input.hidePassword : messages.input.showPassword"
        :aria-pressed="revealed"
        @click="revealed = !revealed"
      >
        <DofIcon :name="revealed ? 'eye-off' : 'eye'" size="sm" />
      </button>
    </template>
  </DofInput>
</template>
