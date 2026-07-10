<script setup lang="ts">
/**
 * Premium coming-soon (UI-COM-001 §3): an empty state that teaches the opportunity
 * (frozen law, ADR-001 §11) — what this space becomes, why it's worth it, and the
 * honest state of things. No countdowns, no fake urgency, no "notify me" theater.
 */
import { DofEmptyState, DofBadge, DofButton, DofText } from '@ds/index'
import { moduleByPath } from '../../composables/workspace-nav'

const route = useRoute()
const router = useRouter()
const module_ = computed(() => moduleByPath(route.path))

useHead({ title: () => `${module_.value?.label ?? 'DOF'} — DOF` })
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-10">
    <DofText v-if="module_" role="headline" as="h1">{{ module_.label }}</DofText>
    <DofEmptyState
      v-if="module_"
      :icon="module_.icon"
      :title="module_.promise"
      :why="module_.why"
      heading-as="h2"
    >
      <template #action>
        <div class="flex items-center gap-3">
          <DofBadge tone="accent">{{ module_.label }} is on its way</DofBadge>
          <DofButton variant="ghost" tone="neutral" size="sm" icon="arrow-left" @click="router.push('/')">
            Back to Home
          </DofButton>
        </div>
      </template>
    </DofEmptyState>
  </div>
</template>
