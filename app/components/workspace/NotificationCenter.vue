<script setup lang="ts">
/**
 * Notification center (UI-COM-001 §6): the sheet-side of the notice pipeline.
 * Infrastructure only — the inbox lists what the toast layer showed, calm rules
 * intact (the empty state is the Bible's designed silence).
 */
import { DofSheet, DofIcon, DofText, DofTime, DofIconButton, useNotices, useDsMessages, cx, type Tone } from '@ds/index'

const open = defineModel<boolean>('open', { default: false })

const { notices, dismiss } = useNotices()
const messages = useDsMessages()

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-muted-foreground', accent: 'text-accent', positive: 'text-positive',
  caution: 'text-caution', critical: 'text-critical', info: 'text-info', ember: 'text-ember',
}
</script>

<template>
  <DofSheet v-model:open="open" :title="messages.notifications.title">
    <p v-if="notices.length === 0" class="py-10 text-center font-ui text-body text-muted-foreground">
      {{ messages.notifications.empty }}
    </p>
    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="notice in notices"
        :key="notice.id"
        class="flex items-start justify-between gap-3 rounded-medium border border-line p-3"
      >
        <div class="flex min-w-0 items-start gap-2.5">
          <DofIcon name="info" size="sm" :class="cx('mt-0.5 shrink-0', TONE_TEXT[notice.tone])" />
          <div class="flex min-w-0 flex-col gap-0.5">
            <DofText as="p">{{ notice.title }}</DofText>
            <DofText v-if="notice.body" role="caption" tone="muted" as="p">{{ notice.body }}</DofText>
            <DofText v-if="notice.deadline" role="caption" as="p" class="text-caution">
              <DofTime :value="notice.deadline" mode="relative" />
            </DofText>
          </div>
        </div>
        <DofIconButton icon="x" :label="messages.common.dismiss" size="sm" @click="dismiss(notice.id)" />
      </li>
    </ul>
  </DofSheet>
</template>
