<script setup lang="ts">
/**
 * The branded error page (Stream B, Batch 1). Until now every 404 — including the
 * deliberate V6 visibility masks on public pages — rendered Nuxt's default developer
 * error screen. Dead ends now stay in DOF's voice and always offer a way back in.
 */
import { DofText, DofButton } from '@ds/index'

const props = defineProps<{ error: { statusCode: number; statusMessage?: string } }>()

const notFound = computed(() => props.error.statusCode === 404)
useHead({ title: () => (notFound.value ? 'Not here — DOF' : 'Something broke — DOF') })

function goHome() {
  clearError({ redirect: '/home' })
}
</script>

<template>
  <main class="flex min-h-dvh flex-col items-center justify-center gap-6 bg-surface px-4 font-ui text-foreground">
    <div class="flex max-w-md flex-col items-center gap-3 text-center">
      <DofText role="caption" class="uppercase tracking-widest text-accent">
        {{ notFound ? '404' : error.statusCode }}
      </DofText>
      <DofText role="headline" as="h1">
        {{ notFound ? 'This corner doesn’t exist' : 'Something broke on our side' }}
      </DofText>
      <DofText role="body" tone="muted" reading>
        {{ notFound
          ? 'The link may be old, or the shop may have taken it down. The street is still open, though.'
          : 'Nothing you did — it’s us. Your work is safe; try again in a moment.' }}
      </DofText>
    </div>
    <div class="flex flex-wrap justify-center gap-2">
      <DofButton tone="accent" icon="flame" @click="goHome">See today’s deals</DofButton>
      <DofButton variant="soft" tone="neutral" icon="arrow-left" @click="$router.back()">Go back</DofButton>
    </div>
    <DofText role="caption" tone="muted">powered by DOF</DofText>
  </main>
</template>
