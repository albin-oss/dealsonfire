<script setup lang="ts">
/**
 * DofProblem — the RFC 9457 problem renderer under the Errors-Educate law
 * (DESIGN-SYSTEM-001 §3.2 Errors; UX-BIBLE §6.4): what happened plainly → what it
 * means → the next step, with the retry carried when retryable. The machine room
 * (raw code/details) lives behind the Inspect rung, never on the front door.
 */
import { ref } from 'vue'
import { useDsMessages } from '../../i18n'
import DofButton from '../../primitives/dof-button.vue'
import DofIcon from '../../primitives/dof-icon.vue'
import DofText from '../../primitives/dof-text.vue'

const props = withDefaults(defineProps<{
  /** Plain what-happened: "We couldn't reach Etsy." */
  title: string
  /** What it means + the next step, in merchant language (the educating detail). */
  detail?: string
  /** Stable platform code (SKU_TAKEN…) — Inspect-rung content. */
  code?: string
  retryable?: boolean
  retrying?: boolean
}>(), { retryable: false, retrying: false })

const emit = defineEmits<{ retry: [] }>()
const messages = useDsMessages()
const inspecting = ref(false)
const hasInspect = Boolean(props.code)
</script>

<template>
  <div role="alert" class="flex flex-col gap-2 rounded-medium border border-critical/30 bg-critical/5 p-4 font-ui">
    <div class="flex items-start gap-2.5">
      <DofIcon name="circle-alert" class="mt-0.5 shrink-0 text-critical" />
      <div class="flex min-w-0 flex-col gap-1">
        <DofText role="emphasis" as="h3">{{ title }}</DofText>
        <DofText v-if="detail" role="body" as="p">{{ detail }}</DofText>
      </div>
    </div>
    <div class="flex items-center gap-2 ps-8">
      <DofButton v-if="retryable" size="sm" variant="soft" tone="neutral" icon="refresh-cw" :loading="retrying" @click="emit('retry')">
        {{ messages.common.retry }}
      </DofButton>
      <slot name="action" />
      <button
        v-if="hasInspect"
        type="button"
        class="dof-interactive rounded-small px-1 text-caption text-faint-foreground focus-visible:focus-ring"
        :aria-expanded="inspecting"
        @click="inspecting = !inspecting"
      >
        {{ inspecting ? messages.common.hideDetails : messages.common.details }}
      </button>
    </div>
    <code v-if="inspecting && code" class="ms-8 w-fit rounded-small bg-surface-sunken px-2 py-1 text-caption text-muted-foreground">{{ code }}</code>
  </div>
</template>
