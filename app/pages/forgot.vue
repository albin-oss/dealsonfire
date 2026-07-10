<script setup lang="ts">
/** /forgot (WP-R1-B1 US-6). Request a reset; the answer is always the same (privacy). */
import { ref } from 'vue'
import { DofButton, DofEmailInput, DofText } from '@ds/index'
import AuthShell from '../components/auth/AuthShell.vue'

definePageMeta({ layout: false })
useHead({ title: 'Reset your password — DOF' })

const email = ref('')
const sent = ref(false)
const busy = ref(false)

async function submit() {
  busy.value = true
  try {
    await $fetch('/api/v1/auth/recovery/request', { method: 'POST', body: { email: email.value } })
    sent.value = true
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AuthShell title="Reset your password" subtitle="We’ll email you a link.">
    <div v-if="sent" class="flex flex-col gap-2 text-center">
      <DofText role="body">If an account uses that email, a reset link is on its way — check your inbox.</DofText>
      <NuxtLink to="/login" class="text-caption text-accent underline">Back to sign in</NuxtLink>
    </div>
    <form v-else class="flex flex-col gap-4" @submit.prevent="submit">
      <DofEmailInput v-model="email" label="Email" autocomplete="email" />
      <DofButton type="submit" tone="accent" size="lg" :loading="busy">Send reset link</DofButton>
      <NuxtLink to="/login" class="text-center text-caption text-muted-foreground underline">Back to sign in</NuxtLink>
    </form>
  </AuthShell>
</template>
