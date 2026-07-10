<script setup lang="ts">
/**
 * DofSettingsLayout — the frozen three-way settings split (ADR-001 §11: Store /
 * Business / Account are different mental models). Sections are data; navigation is
 * a calm side list at regular+, a top list on compact. Nothing here is ever required
 * to start selling — settings are where you go, never where you're sent.
 */
export interface SettingsSection {
  id: string
  label: string
}

defineProps<{
  sections: SettingsSection[]
  activeId: string
}>()

const emit = defineEmits<{ navigate: [id: string] }>()
</script>

<template>
  <div class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 regular:flex-row">
    <nav aria-label="settings sections" class="flex shrink-0 flex-row gap-1 overflow-x-auto regular:w-56 regular:flex-col">
      <button
        v-for="section in sections"
        :key="section.id"
        type="button"
        class="dof-interactive rounded-medium px-3 py-2 text-start font-ui text-body transition-colors tempo-instant ease-settle focus-visible:focus-ring"
        :class="section.id === activeId ? 'bg-surface-sunken font-medium text-foreground' : 'text-muted-foreground hover:bg-surface-sunken/60'"
        :aria-current="section.id === activeId ? 'true' : undefined"
        @click="emit('navigate', section.id)"
      >
        {{ section.label }}
      </button>
    </nav>
    <main class="flex min-w-0 flex-1 flex-col gap-6">
      <slot />
    </main>
  </div>
</template>
