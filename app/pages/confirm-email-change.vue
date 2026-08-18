<script setup lang="ts">
/** /confirm-email-change (C12-3, scanner-safe): a GET lands and changes NOTHING — mailbox
 *  link-scanners visit links; only the human's explicit press posts. */
import { ref } from 'vue'
import { DofButton, DofProblem, DofText } from '@ds/index'
import AuthShell from '../components/auth/AuthShell.vue'

definePageMeta({ layout: false })
useHead({ title: 'Your DOF account — confirm' })

const route = useRoute()
const token = typeof route.query.token === 'string' && route.query.token !== '' ? route.query.token : null
const state = ref<'confirm' | 'done' | 'failed'>(token ? 'confirm' : 'failed')
const busy = ref(false)

async function act() {
  if (!token || busy.value) return
  busy.value = true
  try {
    await $fetch('/api/v1/auth/email-change/confirm', { method: 'POST', body: { token } })
    state.value = 'done'
  } catch {
    state.value = 'failed'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AuthShell title="Your account's email">
    <div v-if="state === 'confirm'" class="flex flex-col gap-4 text-center">
      <DofText role="body" tone="muted">This inbox is about to become where your DOF account lives. Pressing the button completes the move; the old address keeps a 72-hour undo. Nothing happens until you press it.</DofText>
      <DofButton tone="accent" size="lg" :loading="busy" @click="act">Yes, move my account to this email</DofButton>
    </div>
    <div v-else-if="state === 'done'" class="flex flex-col gap-3 text-center" role="status" aria-live="polite">
      <DofText role="emphasis">Done.</DofText>
      <DofText role="body" tone="muted">Sign in fresh whenever you're ready.</DofText>
      <NuxtLink to="/login" class="text-caption text-accent underline">Go to sign in</NuxtLink>
    </div>
    <DofProblem v-else title="That link is no longer valid"
      detail="These links are single-use and time-bounded. If you still need the change, start it again from your account — or write to support if something feels wrong." />
  </AuthShell>
</template>
