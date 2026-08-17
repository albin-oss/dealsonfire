<script setup lang="ts">
/**
 * /account (C12-3) — a corner, not a control panel. The stranger minimum:
 * what DOF holds (email, verification, sessions, passkeys, agreements), the
 * safe way to move the account's email (step-up first, possession proof
 * second, 72-hour way back always), and the everywhere-signout. Street
 * language throughout — no tokens, no "step-up" jargon on screen.
 */
import { ref } from 'vue'
import { DofButton, DofEmailInput, DofPasswordInput, DofProblem, DofText } from '@ds/index'

useHead({ title: 'Your account — DOF' })

interface AccountView {
  email: string
  email_verified: boolean
  pending_email_change: string | null
  active_sessions: number
  passkeys: number
  step_up_verified: boolean
  consents: Array<{ document: string; version: string; action: string }>
}

const { data: account, refresh } = await useFetch<AccountView>('/api/v1/account')

const newEmail = ref('')
const confirmPassword = ref('')
const changeState = ref<'idle' | 'confirming' | 'sent' | 'error'>('idle')
const changeError = ref('')
const signoutDone = ref(false)

async function requestChange() {
  changeError.value = ''
  try {
    if (!account.value?.step_up_verified) {
      // quietly refresh the "it's really you" window with the password first
      changeState.value = 'confirming'
      await $fetch('/api/v1/auth/step-up', { method: 'POST', body: { password: confirmPassword.value } })
    }
    await $fetch('/api/v1/account/email-change', { method: 'POST', body: { new_email: newEmail.value } })
    changeState.value = 'sent'
    await refresh()
  } catch (e) {
    changeState.value = 'error'
    changeError.value = (e as { data?: { detail?: string } }).data?.detail ?? 'That didn’t work — check the address and your password.'
  }
}

async function signOutEverywhere() {
  await $fetch('/api/v1/auth/logout-all', { method: 'POST' })
  signoutDone.value = true
  await refresh()
}
</script>

<template>
  <main class="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10">
    <DofText role="title" as="h1">Your account</DofText>

    <template v-if="account">
      <section class="flex flex-col gap-2 rounded-large border border-line p-4">
        <DofText role="emphasis" as="h2">Your email</DofText>
        <DofText role="body">{{ account.email }}
          <span v-if="account.email_verified" class="text-positive"> — confirmed</span>
          <span v-else class="text-caution"> — not confirmed yet (check your inbox)</span>
        </DofText>
        <DofText v-if="account.pending_email_change" role="caption" tone="muted">
          A move to {{ account.pending_email_change }} is waiting for confirmation from that inbox.
        </DofText>

        <form class="mt-2 flex flex-col gap-3" @submit.prevent="requestChange">
          <DofText role="caption" tone="muted">
            Moving your account to a new address? The new inbox confirms it, this one
            is told, and for 72 hours this inbox can undo it — that's your safety net.
          </DofText>
          <DofEmailInput v-model="newEmail" label="New email" autocomplete="email" />
          <DofPasswordInput
            v-if="!account.step_up_verified"
            v-model="confirmPassword"
            label="Your password"
            description="Changing where your account lives needs a fresh yes from you."
            autocomplete="current-password"
          />
          <DofProblem v-if="changeState === 'error'" title="Couldn’t start the move" :detail="changeError" />
          <div v-if="changeState === 'sent'" role="status" class="text-body text-positive">
            Check the new inbox — the move completes from there.
          </div>
          <DofButton v-else type="submit" tone="accent" :loading="changeState === 'confirming'">
            Move my account to this email
          </DofButton>
        </form>
      </section>

      <section class="flex flex-col gap-2 rounded-large border border-line p-4">
        <DofText role="emphasis" as="h2">Signed-in devices</DofText>
        <DofText role="body" tone="muted">
          {{ account.active_sessions }} active {{ account.active_sessions === 1 ? 'session' : 'sessions' }} ·
          {{ account.passkeys }} {{ account.passkeys === 1 ? 'passkey' : 'passkeys' }}
        </DofText>
        <div v-if="signoutDone" role="status" class="text-body text-positive">
          Done — every other device is signed out.
        </div>
        <DofButton v-else variant="soft" tone="neutral" @click="signOutEverywhere">
          Sign out everywhere else
        </DofButton>
      </section>

      <section class="flex flex-col gap-2 rounded-large border border-line p-4">
        <DofText role="emphasis" as="h2">Agreements</DofText>
        <DofText v-for="c in account.consents" :key="c.document" role="caption" tone="muted">
          {{ c.document }} — {{ c.action }} (version {{ c.version }})
        </DofText>
        <NuxtLink to="/legal/terms" class="text-caption underline">Read the current documents</NuxtLink>
      </section>

      <NuxtLink to="/o" class="text-caption text-muted-foreground underline">Your orders</NuxtLink>
    </template>
    <DofProblem v-else title="Sign in to see your account" detail="Your account page needs you signed in." />
  </main>
</template>
