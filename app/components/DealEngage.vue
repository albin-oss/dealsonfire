<script setup lang="ts">
/**
 * DealEngage (Release 0.4) — the engagement bar: 🔥 react, save, follow the store.
 * One implementation for the feed card and the public deal page. Optimistic with
 * server reconciliation (Increment 13): the tap lands instantly, then the rendered
 * count converges to the server's answer within one round-trip — counts are social
 * proof and stay true; a failed round-trip rolls the tap back and says so.
 * Anonymous-first: the first tap mints the visitor identity server-side; no signup wall.
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
  // the tap lands NOW — the street answers at the speed of thought
  const undo = { fires: fires.value, reacted: reacted.value, saved: saved.value, follows: follows.value }
  if (kind === 'react') {
    reacted.value = !reacted.value
    fires.value += reacted.value ? 1 : -1
    announce(reacted.value ? `You fired this ${props.kind ?? 'deal'}.` : 'Fire removed.')
  } else if (kind === 'save') {
    saved.value = !saved.value
    announce(saved.value ? 'Saved — find it under Saved on the deals page.' : 'Removed from your saved deals.')
  } else {
    follows.value = !follows.value
    announce(follows.value ? `Following ${props.storeName}.` : `Unfollowed ${props.storeName}.`)
  }
  try {
    const path = kind === 'follow'
      ? `/api/v1/public/stores/${encodeURIComponent(props.storeHandle)}/follow`
      : `/api/v1/public/${props.kind === 'spark' ? 'sparks' : 'deals'}/${props.dealId}/${kind}`
    // reconcile: the server's answer is the truth the card ends on
    const res = await $fetch<{ active: boolean; count: number }>(path, { method: 'POST' })
    if (kind === 'react') { reacted.value = res.active; fires.value = res.count }
    else if (kind === 'save') { saved.value = res.active }
    else { follows.value = res.active }
  } catch {
    fires.value = undo.fires; reacted.value = undo.reacted
    saved.value = undo.saved; follows.value = undo.follows
    announce('That didn’t take — nothing was changed; try again.')
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
      :aria-pressed="follows"
      @click="toggle('follow')"
    >
      <template v-if="follows">Following</template>
      <template v-else-if="variant === 'full'"><span class="hidden sm:inline">Follow {{ storeName }}</span><span class="sm:hidden">Follow</span></template>
      <template v-else>Follow</template>
    </DofButton>
  </div>
</template>
