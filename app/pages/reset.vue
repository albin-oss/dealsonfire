<script setup lang="ts">
/** /reset?token=… (WP-R1-B1 US-6). Set a new password; all sessions are revoked server-side. */
import { ref } from 'vue'
import { DofButton, DofPasswordInput, DofProblem, DofText } from '@ds/index'
import AuthShell from '../components/auth/AuthShell.vue'

definePageMeta({ layout: false })
useHead({ title: 'Choose a new password — DOF' })

const route = useRoute()
const password = ref('')
const error = ref('')
const done = ref(false)
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await $fetch('/api/v1/auth/recovery/reset', {
      method: 'POST', body: { token: route.query.token, password: password.value },
    })
    done.value = true
  } catch (e) {
    error.value = (e as { data?: { detail?: string } }).data?.detail ?? 'That link is no longer valid.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AuthShell title="Choose a new password">
    <div v-if="done" class="flex flex-col gap-2 text-center">
      <DofText role="body">Your password is set. Sign in with it now.</DofText>
      <NuxtLink to="/login" class="text-caption text-accent underline">Go to sign in</NuxtLink>
    </div>
    <template v-else>
      <DofProblem v-if="error" title="Couldn’t reset your password" :detail="error" />
      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <DofPasswordInput v-model="password" label="New password" autocomplete="new-password"
          description="At least 10 characters." />
        <DofButton type="submit" tone="accent" size="lg" :loading="busy">Set password</DofButton>
      </form>
    </template>
  </AuthShell>
</template>
