<script setup lang="ts">
/**
 * ReportDoor (C12-2) — the quiet way to say "something here is wrong".
 * A disclosure, not a banner: findable at the foot of a page — never theater,
 * never accusatory chrome. Plain words in, an info-free thank-you out
 * (the answer never reveals what the street knows). No contact fields —
 * the report is the message, not a correspondence.
 */
import { ref } from 'vue'

const props = defineProps<{
  subjectType: 'store' | 'product' | 'deal' | 'spark'
  subjectRef: string
}>()

const REASONS = [
  { value: 'counterfeit', label: 'Counterfeit or fake' },
  { value: 'scam', label: 'Looks like a scam' },
  { value: 'offensive', label: 'Offensive content' },
  { value: 'dangerous', label: 'Dangerous item' },
  { value: 'stolen_content', label: 'Stolen photos or words' },
  { value: 'other', label: 'Something else' },
] as const

const open = ref(false)
const reason = ref<string>('')
const note = ref('')
const state = ref<'idle' | 'sending' | 'done'>('idle')

async function submit() {
  if (!reason.value || state.value !== 'idle') return
  state.value = 'sending'
  try {
    await $fetch('/api/v1/public/report', {
      method: 'POST',
      body: {
        subject_type: props.subjectType,
        subject_ref: props.subjectRef,
        reason: reason.value,
        ...(note.value.trim() ? { note: note.value.trim().slice(0, 1000) } : {}),
      },
    })
  } catch {
    // the answer is deliberately the same either way — a report is a word to
    // the street's keepers, not a transaction with a receipt
  }
  state.value = 'done'
}
</script>

<template>
  <div class="mt-8 text-caption text-faint-foreground">
    <button
      v-if="!open"
      type="button"
      class="underline decoration-dotted underline-offset-2 hover:text-muted-foreground"
      @click="open = true"
    >
      Something wrong here? Tell us.
    </button>
    <div v-else-if="state === 'done'" class="text-muted-foreground">
      Thank you — a human will look. Nothing more is needed from you.
    </div>
    <form v-else class="flex max-w-md flex-col gap-2" @submit.prevent="submit">
      <label class="text-muted-foreground" for="report-reason">What seems wrong?</label>
      <select id="report-reason" v-model="reason" class="rounded-medium border border-line bg-surface-raised px-2 py-1.5 text-body text-foreground" required>
        <option value="" disabled>Choose…</option>
        <option v-for="r in REASONS" :key="r.value" :value="r.value">{{ r.label }}</option>
      </select>
      <textarea
        v-model="note"
        rows="2"
        maxlength="1000"
        class="rounded-medium border border-line bg-surface-raised px-2 py-1.5 text-body text-foreground"
        placeholder="Anything that helps us look (optional — please don't include personal details)"
      />
      <div class="flex gap-3">
        <button type="submit" class="rounded-medium border border-line px-3 py-1.5 text-body text-foreground hover:bg-surface-sunken" :disabled="state === 'sending'">
          Send
        </button>
        <button type="button" class="text-muted-foreground underline decoration-dotted" @click="open = false">
          Never mind
        </button>
      </div>
    </form>
  </div>
</template>
