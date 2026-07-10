<script setup lang="ts">
/** /login (WP-R1-B1 US-3). Password login; passkey offered where available. */
import { ref } from 'vue'
import { DofButton, DofEmailInput, DofPasswordInput, DofProblem, DofText, DofCheckbox } from '@ds/index'
import AuthShell from '../components/auth/AuthShell.vue'
import { startPasskeyLogin } from '../composables/usePasskey'

definePageMeta({ layout: false })
useHead({ title: 'Sign in — DOF' })

const route = useRoute()
const { refresh } = useSession()
const email = ref('')
const password = ref('')
const remember = ref(true)
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await $fetch('/api/v1/auth/login', { method: 'POST', body: { email: email.value, password: password.value, remember: remember.value } })
    await refresh()
    await navigateTo((route.query.next as string) || '/')
  } catch (e) {
    error.value = (e as { data?: { detail?: string } }).data?.detail ?? 'Something went wrong — try again.'
  } finally {
    busy.value = false
  }
}

const passkeyBusy = ref(false)
async function passkey() {
  error.value = ''
  passkeyBusy.value = true
  try {
    await startPasskeyLogin()
    await refresh()
    await navigateTo((route.query.next as string) || '/')
  } catch (e) {
    error.value = (e as Error).message || 'Passkey sign-in was cancelled.'
  } finally {
    passkeyBusy.value = false
  }
}
</script>

<template>
  <AuthShell title="Welcome back" subtitle="Sign in to your workspace">
    <DofProblem v-if="error" title="Couldn’t sign you in" :detail="error" />
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <DofEmailInput v-model="email" label="Email" autocomplete="email" />
      <DofPasswordInput v-model="password" label="Password" autocomplete="current-password" />
      <DofCheckbox v-model="remember" label="Keep me signed in" description="Uncheck on a shared device." />
      <DofButton type="submit" tone="accent" size="lg" :loading="busy">Sign in</DofButton>
    </form>
    <DofButton variant="outline" tone="neutral" icon="shield-check" :loading="passkeyBusy" @click="passkey">
      Sign in with a passkey
    </DofButton>
    <template #footer>
      <DofText role="caption" tone="muted">
        <NuxtLink to="/forgot" class="underline">Forgot your password?</NuxtLink>
        · <NuxtLink to="/register" class="underline">Create an account</NuxtLink>
      </DofText>
    </template>
  </AuthShell>
</template>
