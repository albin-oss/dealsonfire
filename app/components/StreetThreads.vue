<script setup lang="ts">
/**
 * StreetThreads (LS-5) — the explainable next doors under a thing.
 *
 * Two threads, each heading saying WHY it's there: the maker's own words
 * (thing → person → story), and nearby-on-the-street (same lane, OTHER
 * makers — cross-merchant by construction). Sparse world = the section
 * simply isn't there. No carousels, no shelves, no "you may also like".
 */
import { computed } from 'vue'
import { DofText, DofMoney, DofTime } from '@ds/index'
import { markThreadHop } from '../composables/attention'

const props = defineProps<{
  subjectType: 'product' | 'deal'
  subjectId: string
  /** The store the visitor is already on — the voice card names it honestly. */
  storeName: string
}>()

interface Voice { spark_id: string; excerpt: string; store_handle: string; store_name: string; published_at: string }
interface Neighbor { product_id: string; title: string; price_minor: number | null; currency: string | null; store_handle: string; store_name: string; image_url: string | null }
interface Threads { voice: Voice | null; nearby: { lane_id: string; lane_title: string; items: Neighbor[] } | null }

const { data } = useFetch<Threads>('/api/v1/public/threads', {
  query: computed(() => ({ subject_type: props.subjectType, subject_id: props.subjectId })),
  server: false, lazy: true,
})
const hasAny = computed(() => Boolean(data.value?.voice || (data.value?.nearby?.items.length ?? 0) > 0))
</script>

<template>
  <div v-if="hasAny" class="flex flex-col gap-8">
    <!-- thing → person → story -->
    <section v-if="data?.voice" :aria-label="`${storeName}, in their own words`" class="flex flex-col gap-3">
      <DofText role="emphasis" as="h2">{{ storeName }}, in their own words</DofText>
      <NuxtLink
        :to="`/s/${data.voice.store_handle}/sparks/${data.voice.spark_id}`"
        class="dof-interactive flex flex-col gap-2 rounded-large border-s-2 border-accent/40 bg-foreground/[0.02] p-4 transition-colors hover:border-accent focus-visible:focus-ring"
        @click="markThreadHop()"
      >
        <DofText role="body" class="italic text-foreground/85">“{{ data.voice.excerpt }}…”</DofText>
        <DofText role="caption" tone="muted">
          — {{ data.voice.store_name }} · <DofTime :value="data.voice.published_at" mode="relative" />
        </DofText>
      </NuxtLink>
    </section>

    <!-- same part of the street, other makers -->
    <section
      v-if="data?.nearby && data.nearby.items.length > 0"
      :aria-label="`nearby on the street — ${data.nearby.lane_title}`"
      class="flex flex-col gap-3"
    >
      <div class="flex flex-col gap-0.5">
        <DofText role="emphasis" as="h2">Nearby on the street</DofText>
        <DofText role="caption" tone="muted">
          more <NuxtLink :to="`/street/${data.nearby.lane_id}`" class="underline underline-offset-4">{{ data.nearby.lane_title }}</NuxtLink> — from other makers
        </DofText>
      </div>
      <ul class="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-3">
        <li v-for="n in data.nearby.items" :key="n.product_id">
          <NuxtLink
            :to="`/s/${n.store_handle}/p/${n.product_id}`"
            class="dof-interactive flex h-full flex-col gap-2 rounded-large border border-foreground/10 bg-foreground/[0.02] p-3 transition-colors hover:border-accent focus-visible:focus-ring"
            @click="markThreadHop()"
          >
            <PublicImg v-if="n.image_url" :src="n.image_url" :alt="n.title" img-class="h-24 w-full rounded-medium object-cover" />
            <div class="flex items-baseline justify-between gap-2">
              <DofText role="caption" class="truncate font-medium text-foreground">{{ n.title }}</DofText>
              <DofMoney v-if="n.price_minor !== null" :amount="n.price_minor" :currency="n.currency ?? 'EUR'" class="shrink-0 text-caption" />
            </div>
            <DofText role="caption" tone="muted">{{ n.store_name }}</DofText>
          </NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>
