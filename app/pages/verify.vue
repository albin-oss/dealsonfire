<script setup lang="ts">
/**
 * /verify (CAP-R1-ID-002; scanner-safe since C12-3). One page, four honest states:
 *  - pending:   landed without a token (post-registration) — check your inbox, resend
 *  - confirm:   a token is present — the page LANDS WITHOUT CONSUMING IT and
 *               says what the button will do (C12-1 finding F2: mailbox
 *               link-scanners follow links; a GET must never spend a security
 *               token). Only the explicit press posts.
 *  - done:      confirmed — redirected into onboarding (the workspace)
 *  - failed:    the link is expired/used/invalid — expiry messaging + resend
 * Verification never blocked selling; resend is enumeration-proof (uniform answer).
 */
import { ref } from 'vue'
import { DofButton, DofEmailInput, DofProblem, DofText } from '@ds/index'
import AuthShell from '../components/auth/AuthShell.vue'

definePageMeta({ layout: false })
useHead({ title: 'Confirm your email — DOF' })

const route = useRoute()
type State = 'pending' | 'confirm' | 'done' | 'failed'
const token = typeof route.query.token === 'string' && route.query.token !== '' ? route.query.token : null
const state = ref<State>(token ? 'confirm' : 'pending')
const confirmBusy = ref(false)

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

async function confirm() {
  if (!token || confirmBusy.value) return
  confirmBusy.value = true
  try {
    await $fetch('/api/v1/auth/verify-email', { method: 'POST', body: { token } })
    state.value = 'done'
    setTimeout(() => { navigateTo('/') }, 1500)
  } catch {
    state.value = 'failed'
  } finally {
    confirmBusy.value = false
  }
}
</script>

<template>
  <AuthShell title="Confirm your email">
    <!-- confirm: the human presses; a scanner's visit changes nothing -->
    <div v-if="state === 'confirm'" class="flex flex-col gap-4 text-center">
      <DofText role="body" tone="muted">
        Pressing the button confirms this email address belongs to you and
        secures your account's recovery. Nothing happens until you press it.
      </DofText>
      <DofButton tone="accent" size="lg" :loading="confirmBusy" @click="confirm">
        Yes, confirm my email
      </DofButton>
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
