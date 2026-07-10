<script setup lang="ts">
/** /register (WP-R1-B1 US-1). Create account; optional passkey add after. Never blocks. */
import { ref } from 'vue'
import { DofButton, DofEmailInput, DofInput, DofPasswordInput, DofProblem } from '@ds/index'
import AuthShell from '../components/auth/AuthShell.vue'
import { registerPasskey } from '../composables/usePasskey'

definePageMeta({ layout: false })
useHead({ title: 'Create your account — DOF' })

const { refresh } = useSession()
const route = useRoute()
const email = ref('')
const password = ref('')
const displayName = ref('')
const error = ref('')
const busy = ref(false)

// US-8: an Ignite founder reaching Claim hands off here with their draft ref; the
// account registration attaches it (source = ignite_claim).
const claim = route.query.claim_type && route.query.claim_ref
  ? { type: String(route.query.claim_type), ref: String(route.query.claim_ref) }
  : undefined

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await $fetch('/api/v1/auth/register', {
      method: 'POST',
      body: { email: email.value, password: password.value, display_name: displayName.value || null, claim },
    })
    await refresh()
    // offer a passkey as a gentle next step; never required
    await registerPasskey('This device').catch(() => {})
    await navigateTo('/')
  } catch (e) {
    error.value = (e as { data?: { detail?: string } }).data?.detail ?? 'Couldn’t create your account — try again.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AuthShell title="Create your account" subtitle="One account — it grows with you.">
    <DofProblem v-if="error" title="Couldn’t create your account" :detail="error" />
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <DofInput v-model="displayName" label="Your name (optional)" autocomplete="name" />
      <DofEmailInput v-model="email" label="Email" autocomplete="email" />
      <DofPasswordInput v-model="password" label="Password" autocomplete="new-password"
        description="At least 10 characters — a short sentence works well." />
      <DofButton type="submit" tone="accent" size="lg" :loading="busy">Create account</DofButton>
    </form>
    <template #footer>
      <NuxtLink to="/login" class="text-caption text-muted-foreground underline">Already have an account? Sign in</NuxtLink>
    </template>
  </AuthShell>
</template>
