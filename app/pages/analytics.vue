<script setup lang="ts">
/**
 * /analytics — "What the Street noticed" (LS-7). The demand receipts: sentences
 * first, derived server-side (this page renders them, never invents them).
 * Deliberately calm — a few honest lines, then optional deeper evidence. If
 * nothing happened, it says so kindly and points the maker at what earns
 * attention. Never a dashboard.
 */
import { computed, watch } from 'vue'
import { DofText, DofSkeleton } from '@ds/index'
import { useDevHeaders } from '../composables/dev-headers'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'What the Street noticed — DOF' })

interface Receipts {
  any_attention: boolean
  found: { people: number; glances: number }
  doors: Array<{ source: string; people: number }>
  searches: Array<{ phrase: string; people: number }>
  caught: { subject_type: string; subject_id: string; title: string; people: number } | null
  did: { follows: number; saves: number; fires: number }
  returned: number
  sentences: string[]
}

const headers = useDevHeaders()
const { data: workspace } = useFetch<{ businesses: Array<{ business_id: string }> }>('/api/v1/workspace', {
  lazy: true, server: false, headers,
})
const businessId = computed(() => workspace.value?.businesses[0]?.business_id ?? null)
const { data, pending, refresh } = useFetch<Receipts>(
  () => `/api/v1/workspace/demand?business_id=${businessId.value ?? ''}`,
  { lazy: true, server: false, headers, immediate: false },
)
watch(businessId, (id) => { if (id) void refresh() }, { immediate: true })

const DOOR_WORDS: Record<string, string> = {
  home: 'the Street feed', shops: 'the shop directory', storefront: 'other shops’ pages',
  search: 'search', direct: 'direct links', lane: 'lanes', thread: 'makers’ pages',
}
</script>

<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 py-10">
    <header class="flex flex-col gap-1">
      <DofText role="title" as="h1">What the Street noticed</DofText>
      <DofText role="caption" tone="muted">The last seven days, in plain words — not a dashboard.</DofText>
    </header>

    <div v-if="pending && !data" class="flex flex-col gap-3" aria-hidden="true">
      <DofSkeleton v-for="n in 3" :key="n" class="h-8 rounded-medium" />
    </div>

    <!-- the honest sentences, first and largest -->
    <section v-else-if="data && data.sentences.length > 0" aria-label="what happened" class="flex flex-col gap-4">
      <DofText v-for="(line, i) in data.sentences" :key="i" role="emphasis" as="p" class="text-foreground">
        {{ line }}
      </DofText>
    </section>

    <!-- attention exists but only glances → gentle, honest -->
    <section v-else-if="data && data.any_attention" aria-label="glances only" class="flex flex-col gap-2">
      <DofText role="body">A few glances passed through, but nobody stopped long enough to count as a visit yet.</DofText>
      <DofText role="caption" tone="muted">A new photo or a short update often turns a glance into a visit.</DofText>
    </section>

    <!-- nothing yet → kind, never punishing -->
    <section v-else aria-label="quiet week" class="flex flex-col gap-2">
      <DofText role="emphasis" as="h2">Quiet week — the Street hasn’t brought anyone by yet.</DofText>
      <DofText role="body" tone="muted">
        That’s normal early on. Publishing a new thing or a short update puts you back on the Street’s Home,
        where people find shops. When someone does stop by, you’ll read about it here — in sentences, never charts.
      </DofText>
      <NuxtLink to="/sparks" class="dof-interactive mt-1 self-start rounded-small px-1 text-caption text-accent underline-offset-4 hover:underline focus-visible:focus-ring">
        Post an update →
      </NuxtLink>
    </section>

    <!-- optional deeper evidence — only when there's more than the sentences already said -->
    <section v-if="data && (data.doors.length > 1 || data.searches.length > 0)" aria-label="where they came from" class="flex flex-col gap-3 border-t border-foreground/10 pt-6">
      <DofText role="emphasis" as="h2">Where people came from</DofText>
      <ul class="flex list-none flex-col gap-1 p-0">
        <li v-for="d in data.doors" :key="d.source" class="flex items-baseline justify-between gap-3">
          <DofText role="body">{{ DOOR_WORDS[d.source] ?? d.source }}</DofText>
          <DofText role="caption" tone="muted">{{ d.people }} {{ d.people === 1 ? 'person' : 'people' }}</DofText>
        </li>
      </ul>
      <DofText v-if="data.searches.length > 0" role="caption" tone="muted">
        Found in search: {{ data.searches.map((s) => `“${s.phrase}”`).join(', ') }}
      </DofText>
    </section>
  </main>
</template>
