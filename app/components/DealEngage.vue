<script setup lang="ts">
/**
 * DealEngage (Release 0.4) — the engagement bar: 🔥 react, save, follow the store.
 * One implementation for the feed card and the public deal page. Optimistic-free by
 * design: every tap round-trips the idempotent toggle and renders the server's answer
 * (counts are social proof — they must be true). Anonymous-first: the first tap mints
 * the visitor identity server-side; no signup wall.
 */
import { ref, watch } from 'vue'
import { DofButton, announce } from '@ds/index'

const props = defineProps<{
  /** The subject: deal (fire/save/follow), spark (fire/follow), store (follow only). */
  kind?: 'deal' | 'spark' | 'store'
  dealId: string
  storeHandle: string
  storeName: string
  fires: number
  reacted: boolean
  saved?: boolean
  follows: boolean
  /** compact = feed card row; full = deal page (adds the follow label) */
  variant?: 'compact' | 'full'
}>()

const fires = ref(props.fires)
const reacted = ref(props.reacted)
const saved = ref(props.saved ?? false)
const follows = ref(props.follows)
watch(() => props.fires, (v) => (fires.value = v))
watch(() => props.reacted, (v) => (reacted.value = v))
watch(() => props.saved, (v) => (saved.value = v ?? false))
watch(() => props.follows, (v) => (follows.value = v))

const busy = ref<'react' | 'save' | 'follow' | null>(null)

async function toggle(kind: 'react' | 'save' | 'follow') {
  if (busy.value) return
  busy.value = kind
  try {
    const path = kind === 'follow'
      ? `/api/v1/public/stores/${encodeURIComponent(props.storeHandle)}/follow`
      : `/api/v1/public/${props.kind === 'spark' ? 'sparks' : 'deals'}/${props.dealId}/${kind}`
    const res = await $fetch<{ active: boolean; count: number }>(path, { method: 'POST' })
    if (kind === 'react') {
      reacted.value = res.active
      fires.value = res.count
      announce(res.active ? `You fired this ${props.kind ?? 'deal'}.` : 'Fire removed.')
    } else if (kind === 'save') {
      saved.value = res.active
      announce(res.active ? 'Saved — find it under Saved on the deals page.' : 'Removed from your saved deals.')
    } else {
      follows.value = res.active
      announce(res.active ? `Following ${props.storeName}.` : `Unfollowed ${props.storeName}.`)
    }
  } catch {
    announce('That didn’t take — try again.')
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="deal actions">
    <DofButton
      v-if="kind !== 'store'"
      size="sm"
      :variant="reacted ? 'soft' : 'ghost'"
      :tone="reacted ? 'accent' : 'neutral'"
      icon="flame"
      :loading="busy === 'react'"
      :aria-pressed="reacted"
      @click="toggle('react')"
    >
      {{ fires > 0 ? fires : 'Fire' }}
    </DofButton>
    <DofButton
      v-if="kind !== 'spark' && kind !== 'store'"
      size="sm"
      :variant="saved ? 'soft' : 'ghost'"
      :tone="saved ? 'accent' : 'neutral'"
      icon="bookmark"
      :loading="busy === 'save'"
      :aria-pressed="saved"
      @click="toggle('save')"
    >
      {{ saved ? 'Saved' : 'Save' }}
    </DofButton>
    <DofButton
      size="sm"
      :variant="follows ? 'soft' : 'ghost'"
      :tone="follows ? 'accent' : 'neutral'"
      icon="users"
      :loading="busy === 'follow'"
      :aria-pressed="follows"
      @click="toggle('follow')"
    >
      {{ follows ? 'Following' : variant === 'full' ? `Follow ${storeName}` : 'Follow' }}
    </DofButton>
  </div>
</template>
