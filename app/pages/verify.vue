<script setup lang="ts">
/** /verify?token=… (WP-R1-B1 US-6). Confirms an email; verification never blocked selling. */
import { ref, onMounted } from 'vue'
import { DofButton, DofProblem, DofText, DofSpinner } from '@ds/index'
import AuthShell from '../components/auth/AuthShell.vue'

definePageMeta({ layout: false })
useHead({ title: 'Confirm your email — DOF' })

const route = useRoute()
const state = ref<'verifying' | 'done' | 'failed'>('verifying')

onMounted(async () => {
  const token = route.query.token
  if (typeof token !== 'string' || token === '') {
    state.value = 'failed'
    return
  }
  try {
    await $fetch('/api/v1/auth/verify-email', { method: 'POST', body: { token } })
    state.value = 'done'
  } catch {
    state.value = 'failed'
  }
})
</script>

<template>
  <AuthShell title="Confirm your email">
    <div v-if="state === 'verifying'" class="flex flex-col items-center gap-3 text-center">
      <DofSpinner size="lg" label="Confirming your email" />
      <DofText role="body" tone="muted">One moment…</DofText>
    </div>

    <div v-else-if="state === 'done'" class="flex flex-col gap-3 text-center">
      <DofText role="emphasis">Email confirmed.</DofText>
      <DofText role="body" tone="muted">Your account is fully secured — password recovery is now protected.</DofText>
      <NuxtLink to="/" class="text-caption text-accent underline">Go to your workspace</NuxtLink>
    </div>

    <div v-else class="flex flex-col gap-3">
      <DofProblem
        title="That link is no longer valid"
        detail="Verification links expire and can only be used once. You can keep using DOF in the meantime — request a fresh link from your account settings when you're ready."
      />
      <DofButton :as="'a'" href="/" variant="soft" tone="neutral">Go to your workspace</DofButton>
    </div>
  </AuthShell>
</template>
