<script setup lang="ts">
/**
 * /verify (CAP-R1-ID-002). One page, four honest states:
 *  - pending:   landed without a token (post-registration) — check your inbox, resend
 *  - verifying: a token is being validated
 *  - done:      confirmed — redirected into onboarding (the workspace)
 *  - failed:    the link is expired/used/invalid — expiry messaging + resend
 * Verification never blocked selling; resend is enumeration-proof (uniform answer).
 */
import { ref, onMounted } from 'vue'
import { DofButton, DofEmailInput, DofProblem, DofText, DofSpinner } from '@ds/index'
import AuthShell from '../components/auth/AuthShell.vue'

definePageMeta({ layout: false })
useHead({ title: 'Confirm your email — DOF' })

const route = useRoute()
type State = 'pending' | 'verifying' | 'done' | 'failed'
const state = ref<State>('verifying')

// resend affordance (shared by pending + failed)
const email = ref('')
const resendBusy = ref(false)
const resendSent = ref(false)

async function resend() {
  if (resendBusy.value) return
  resendBusy.value = true
  try {
    await $fetch('/api/v1/auth/resend-verification', { method: 'POST', body: { email: email.value } })
  } catch {
    // swallow — the answer is uniform whether or not the address exists
  } finally {
    resendSent.value = true // we always say "check your inbox" (enumeration-proof)
    resendBusy.value = false
  }
}

onMounted(async () => {
  const token = route.query.token
  if (typeof token !== 'string' || token === '') {
    state.value = 'pending' // no token → "we sent you a link"
    return
  }
  try {
    await $fetch('/api/v1/auth/verify-email', { method: 'POST', body: { token } })
    state.value = 'done'
    // redirect into onboarding (the workspace) after a brief confirmation beat
    setTimeout(() => { navigateTo('/') }, 1500)
  } catch {
    state.value = 'failed'
  }
})
</script>

<template>
  <AuthShell title="Confirm your email">
    <!-- verifying -->
    <div v-if="state === 'verifying'" class="flex flex-col items-center gap-3 text-center">
      <DofSpinner size="lg" label="Confirming your email" />
      <DofText role="body" tone="muted">One moment…</DofText>
    </div>

    <!-- done → onboarding -->
    <div v-else-if="state === 'done'" class="flex flex-col gap-3 text-center" role="status" aria-live="polite">
      <DofText role="emphasis">Email confirmed.</DofText>
      <DofText role="body" tone="muted">Taking you to your workspace…</DofText>
      <NuxtLink to="/" class="text-caption text-accent underline">Go now</NuxtLink>
    </div>

    <!-- pending (no token) + failed (expired/used) share the resend affordance -->
    <div v-else class="flex flex-col gap-4">
      <template v-if="state === 'pending'">
        <DofText role="emphasis">Check your inbox.</DofText>
        <DofText role="body" tone="muted">
          We sent a confirmation link to your email. Open it to secure your account — you can keep
          using DOF in the meantime.
        </DofText>
      </template>
      <DofProblem
        v-else
        title="That link is no longer valid"
        detail="Verification links expire after 30 minutes and can only be used once. Request a fresh one below — you can keep using DOF in the meantime."
      />

      <div v-if="resendSent" role="status" aria-live="polite" class="flex flex-col gap-2">
        <DofText role="emphasis">On its way.</DofText>
        <DofText role="body" tone="muted">If that address has an unverified account, a new link is on its way.</DofText>
      </div>
      <form v-else class="flex flex-col gap-3" @submit.prevent="resend">
        <DofEmailInput v-model="email" label="Email" autocomplete="email" />
        <DofButton type="submit" tone="accent" :loading="resendBusy">Send a new link</DofButton>
      </form>

      <NuxtLink to="/" class="text-caption text-muted-foreground underline">Go to your workspace</NuxtLink>
    </div>
  </AuthShell>
</template>
