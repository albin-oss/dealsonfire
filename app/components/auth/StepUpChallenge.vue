<script setup lang="ts">
/** Inline step-up challenge (WP-R1-B1 US-5): a dialog that confirms identity without
 *  losing the pending action. Password (passkey step-up is a later enhancement). */
import { ref, watch } from 'vue'
import { DofDialog, DofPasswordInput, DofButton, DofProblem } from '@ds/index'

const props = defineProps<{ open: boolean; busy: boolean; error: string }>()
const emit = defineEmits<{ submit: [password: string]; cancel: [] }>()

const password = ref('')
watch(() => props.open, (o) => { if (o) password.value = '' })
</script>

<template>
  <DofDialog
    :open="open"
    title="Confirm it’s you"
    description="This is a sensitive change, so we ask for your password once more."
    tone="critical"
    @update:open="(v: boolean) => { if (!v) emit('cancel') }"
  >
    <DofProblem v-if="error" title="Couldn’t confirm" :detail="error" />
    <form class="flex flex-col gap-3" @submit.prevent="emit('submit', password)">
      <DofPasswordInput v-model="password" label="Password" autocomplete="current-password" />
    </form>
    <template #footer="{ close }">
      <DofButton variant="ghost" tone="neutral" @click="close(); emit('cancel')">Cancel</DofButton>
      <DofButton tone="accent" :loading="busy" @click="emit('submit', password)">Confirm</DofButton>
    </template>
  </DofDialog>
</template>
