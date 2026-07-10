<script setup lang="ts">
/**
 * DofAskBar — ONE bar, two dialects (DESIGN-SYSTEM-001 DS-8, §4.2): today the
 * command-palette dialect (registry commands + recent searches + async providers);
 * the Copilot dialect plugs into the same surface when Ignite's brain arrives.
 * Top-aligned dialog, mod+k global shortcut wired by the shell, full keyboard
 * operability, folded literal matching (the useSearch law).
 */
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle } from 'reka-ui'
import { computed, ref, watch } from 'vue'
import { listCommands, type Command, type SearchProvider, type SearchResult } from '../composables/commands'
import { useDsMessages } from '../../i18n'
import { cx } from '../../utils/cx'
import DofIcon from '../../primitives/dof-icon.vue'

const open = defineModel<boolean>('open', { default: false })

const props = withDefaults(defineProps<{
  /** Recent search terms (persistence is the app's — emit `search` to record). */
  recentSearches?: string[]
  /** Future async result providers (server search…) — UI-COM-001 §4 seam. */
  providers?: SearchProvider[]
}>(), { recentSearches: () => [], providers: () => [] })

const emit = defineEmits<{ search: [term: string] }>()

const messages = useDsMessages()
const term = ref('')
const activeIndex = ref(0)
const providerResults = ref<Array<{ provider: SearchProvider; results: SearchResult[] }>>([])
let searchToken = 0

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

watch(open, (isOpen) => {
  if (isOpen) {
    term.value = ''
    activeIndex.value = 0
    providerResults.value = []
  }
})

watch(term, async (value) => {
  activeIndex.value = 0
  const token = ++searchToken
  if (value.trim() === '' || props.providers.length === 0) {
    providerResults.value = []
    return
  }
  const settled = await Promise.all(props.providers.map(async (provider) => ({
    provider,
    results: await provider.search(value.trim()).catch(() => [] as SearchResult[]),
  })))
  if (token === searchToken) providerResults.value = settled.filter((s) => s.results.length > 0)
})

interface Row {
  key: string
  label: string
  hint?: string
  icon?: Command['icon']
  run: () => void
}
interface Group {
  heading: string
  rows: Row[]
}

const groups = computed<Group[]>(() => {
  const folded = fold(term.value.trim())
  const out: Group[] = []

  if (folded === '' && props.recentSearches.length > 0) {
    out.push({
      heading: messages.palette.recent,
      rows: props.recentSearches.slice(0, 5).map((recent) => ({
        key: `recent:${recent}`,
        label: recent,
        icon: 'search' as const,
        run: () => { term.value = recent },
      })),
    })
  }

  const byGroup = new Map<string, Row[]>()
  for (const command of listCommands()) {
    const haystack = fold([command.label, ...(command.keywords ?? [])].join(' '))
    if (folded !== '' && !haystack.includes(folded)) continue
    const rows = byGroup.get(command.group) ?? []
    rows.push({
      key: command.id,
      label: command.label,
      icon: command.icon,
      run: () => { close(); command.run() },
    })
    byGroup.set(command.group, rows)
  }
  for (const [heading, rows] of byGroup) out.push({ heading, rows })

  for (const { provider, results } of providerResults.value) {
    out.push({
      heading: provider.label,
      rows: results.map((result) => ({
        key: `${provider.id}:${result.id}`,
        label: result.label,
        hint: result.hint,
        run: () => { close(); result.run() },
      })),
    })
  }
  return out
})

const flatRows = computed(() => groups.value.flatMap((g) => g.rows))

function close() {
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  const count = flatRows.value.length
  if (event.key === 'ArrowDown' && count > 0) {
    event.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % count
  } else if (event.key === 'ArrowUp' && count > 0) {
    event.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + count) % count
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const row = flatRows.value[activeIndex.value]
    if (row) {
      if (term.value.trim() !== '') emit('search', term.value.trim())
      row.run()
    } else if (term.value.trim() !== '') {
      emit('search', term.value.trim())
    }
  }
}

function indexOfRow(row: Row): number {
  return flatRows.value.findIndex((r) => r.key === row.key)
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 layer-overlay bg-foreground/40" />
      <DialogContent
        class="fixed inset-x-4 top-16 layer-overlay mx-auto flex max-h-[70vh] w-auto max-w-xl flex-col overflow-hidden rounded-large border border-line bg-surface-raised font-ui shadow-spotlight focus:outline-none"
        :aria-label="messages.palette.open"
        @keydown="onKeydown"
      >
        <DialogTitle class="sr-only">{{ messages.palette.open }}</DialogTitle>
        <div class="flex items-center gap-2 border-b border-line px-4 py-3">
          <DofIcon name="search" size="sm" class="shrink-0 text-muted-foreground" />
          <input
            v-model="term"
            type="text"
            class="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-faint-foreground"
            :placeholder="messages.palette.placeholder"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls="dof-askbar-list"
          >
          <kbd class="rounded-small border border-line px-1.5 py-0.5 text-caption text-faint-foreground">esc</kbd>
        </div>
        <div id="dof-askbar-list" role="listbox" class="min-h-0 flex-1 overflow-y-auto p-2">
          <p v-if="flatRows.length === 0" class="px-2.5 py-6 text-center text-caption text-muted-foreground">
            {{ messages.palette.noResults }}
          </p>
          <template v-for="group in groups" :key="group.heading">
            <p class="px-2.5 pb-1 pt-2 text-caption font-medium text-faint-foreground">{{ group.heading }}</p>
            <button
              v-for="row in group.rows"
              :key="row.key"
              type="button"
              role="option"
              :aria-selected="indexOfRow(row) === activeIndex"
              :class="cx(
                'flex w-full items-center gap-2.5 rounded-small px-2.5 py-2 text-start text-body text-foreground transition-colors tempo-instant ease-settle',
                indexOfRow(row) === activeIndex ? 'bg-surface-sunken' : 'hover:bg-surface-sunken/60',
              )"
              @mouseenter="activeIndex = indexOfRow(row)"
              @click="row.run()"
            >
              <DofIcon v-if="row.icon" :name="row.icon" size="sm" class="shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate">{{ row.label }}</span>
              <span v-if="row.hint" class="shrink-0 text-caption text-faint-foreground">{{ row.hint }}</span>
            </button>
          </template>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
