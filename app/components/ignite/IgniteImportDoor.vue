<script setup lang="ts">
/**
 * The Bring-It door (ADR-005 §3.1; UI-COM-002 §4): "Already selling somewhere?"
 * folded into question one — never a separate step. CSV/Excel parse real files
 * client-side; platform sources state their honest pending status (their adapters
 * arrive with the import backend — no fake OAuth, no pretend catalogs).
 */
import { ref } from 'vue'
import { DofButton, DofSheet, DofIcon, DofText, DofBadge, DofProblem, cx } from '@ds/index'
import { IMPORT_SOURCES, parseProductsCsv, type ImportSource } from '../../composables/ignite/import-sources'
import type { IgniteState } from '../../composables/ignite/journey'

const props = defineProps<{
  state: IgniteState
}>()

const open = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const parseError = ref('')
const pendingSource = ref<ImportSource | null>(null)

function choose(source: ImportSource) {
  parseError.value = ''
  if (source.kind === 'file') {
    pendingSource.value = source
    fileInput.value?.click()
    return
  }
  pendingSource.value = source
}

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !pendingSource.value) return
  const text = await file.text()
  const { products, skipped } = parseProductsCsv(text)
  if (products.length === 0) {
    parseError.value = 'DOF looked for a “title” or “name” column and couldn’t find one — check the first row of your file and try again.'
    return
  }
  props.state.importedProducts = products
  props.state.importSkipped = skipped
  props.state.importSourceId = pendingSource.value.id
  const first = products[0]!
  if (props.state.productTitle === '') props.state.productTitle = first.title
  if (props.state.priceMinor === null) props.state.priceMinor = first.priceMinor
  open.value = false
  ;(event.target as HTMLInputElement).value = ''
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <button
      type="button"
      class="dof-interactive w-fit rounded-small px-1 font-ui text-caption text-muted-foreground underline-offset-2 hover:underline focus-visible:focus-ring"
      @click="open = true"
    >
      Already selling somewhere? Bring it along.
    </button>
    <DofText v-if="state.importedProducts.length > 0" role="caption" tone="faint">
      <DofIcon name="circle-check" size="sm" class="me-1 inline size-3.5 text-positive" />
      {{ state.importedProducts.length }} products ready from your file<span v-if="state.importSkipped > 0"> · {{ state.importSkipped }} rows skipped (no title)</span>
    </DofText>

    <input ref="fileInput" type="file" accept=".csv,text/csv" class="sr-only" aria-hidden="true" tabindex="-1" @change="onFile">

    <DofSheet v-model:open="open" title="Bring your products along">
      <div class="flex flex-col gap-2">
        <button
          v-for="source in IMPORT_SOURCES"
          :key="source.id"
          type="button"
          :class="cx(
            'dof-interactive flex items-center justify-between gap-3 rounded-medium border border-line p-3 text-start transition-colors tempo-instant ease-settle focus-visible:focus-ring',
            source.available ? 'hover:bg-surface-sunken' : 'opacity-hint',
          )"
          @click="choose(source)"
        >
          <span class="flex min-w-0 items-center gap-2.5">
            <DofIcon :name="source.icon" size="sm" class="shrink-0 text-muted-foreground" />
            <span class="flex min-w-0 flex-col">
              <DofText as="span">{{ source.label }}</DofText>
              <DofText role="caption" tone="faint" as="span">brings: {{ source.brings.join(' · ') }}</DofText>
            </span>
          </span>
          <DofBadge :tone="source.available ? 'positive' : 'neutral'">
            {{ source.available ? 'ready' : 'on its way' }}
          </DofBadge>
        </button>
        <DofText v-if="pendingSource && !pendingSource.available" role="caption" tone="muted">
          {{ pendingSource.label }} import arrives with the connection backend — your store doesn't have to wait for it.
        </DofText>
        <DofProblem v-if="parseError" title="That file didn't parse." :detail="parseError" />
      </div>
    </DofSheet>
  </div>
</template>
