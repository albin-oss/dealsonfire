<script setup lang="ts">
/**
 * DofMediaSlot — the photo slot (UX-AUTHOR-002 §C2). Speaks only to the Media Port shape:
 * the caller supplies `upload(file) → { mediaId, url }`, so the component works unchanged
 * when Vercel Blob gives way to the C9 Media capability. Inviting empty state, progress,
 * thumbnail + alt text, remove. A real <input type=file> under the hood (a11y, mobile
 * camera). Permanent DS component — brand kit and Sparks reuse it next.
 */
import { ref } from 'vue'
import { useDsMessages } from '../i18n'
import DofIcon from './dof-icon.vue'
import DofText from './dof-text.vue'
import DofInput from './dof-input.vue'
import DofIconButton from './dof-icon-button.vue'

export interface SlotMedia {
  mediaId: string
  url: string
  alt: string
}

const props = defineProps<{
  /** The Media Port edge: upload a file, get the stored reference. */
  upload: (file: File) => Promise<{ mediaId: string; url: string }>
  modelValue: SlotMedia | null
}>()

const emit = defineEmits<{ 'update:modelValue': [value: SlotMedia | null] }>()
const messages = useDsMessages()

const input = ref<HTMLInputElement>()
const uploading = ref(false)
const problem = ref('')

async function onPick(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  problem.value = ''
  uploading.value = true
  try {
    const stored = await props.upload(file)
    emit('update:modelValue', { ...stored, alt: '' })
  } catch (error) {
    problem.value = (error as { data?: { detail?: string } }).data?.detail ?? messages.media.failed
  } finally {
    uploading.value = false
    if (input.value) input.value.value = ''
  }
}

function setAlt(alt: string | undefined) {
  if (props.modelValue) emit('update:modelValue', { ...props.modelValue, alt: alt ?? '' })
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <input ref="input" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" @change="onPick">

    <!-- filled: thumbnail + alt + remove -->
    <div v-if="modelValue" class="flex items-start gap-3">
      <img :src="modelValue.url" :alt="modelValue.alt || messages.media.pending" class="size-24 shrink-0 rounded-medium border border-line object-cover">
      <div class="flex flex-1 flex-col gap-2">
        <DofInput
          :model-value="modelValue.alt"
          :label="messages.media.altLabel"
          :description="messages.media.altWhy"
          @update:model-value="setAlt"
        />
      </div>
      <DofIconButton icon="x" :label="messages.media.remove" size="sm" tone="neutral" @click="emit('update:modelValue', null)" />
    </div>

    <!-- empty: the invitation -->
    <button
      v-else
      type="button"
      class="dof-interactive flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-large border border-dashed border-line text-muted-foreground hover:border-faint-foreground focus-visible:focus-ring"
      :disabled="uploading"
      @click="input?.click()"
    >
      <DofIcon :name="uploading ? 'loader-circle' : 'camera'" size="md" :class="uploading && 'animate-spin'" />
      <DofText role="caption" tone="muted">{{ uploading ? messages.media.uploading : messages.media.add }}</DofText>
    </button>

    <DofText v-if="problem" role="caption" class="text-critical" aria-live="polite">{{ problem }}</DofText>
  </div>
</template>
