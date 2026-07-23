<script setup lang="ts">
/**
 * StreetSearch (Increment 08) — the public search combobox: instant grouped results
 * (shops / products / deals / updates), full keyboard navigation (combobox + listbox
 * ARIA), recent searches on this device only. Matches are found, never ranked —
 * newest first within each group, per the street's no-ranking law.
 */
import { computed, ref, watch } from 'vue'
import { DofText, DofIcon, DofMoney } from '@ds/index'

interface Results {
  shops: Array<{ handle: string; name: string; tagline: string | null }>
  products: Array<{ id: string; title: string; price_minor: number | null; currency: string | null; store_handle: string; store_name: string }>
  deals: Array<{ id: string; headline: string; store_handle: string; store_name: string }>
  sparks: Array<{ id: string; excerpt: string; store_handle: string; store_name: string }>
}
interface Option { to: string; label: string; context: string; group: string }

const router = useRouter()
const q = ref('')
const open = ref(false)
const active = ref(-1)
const results = ref<Results | null>(null)
const searching = ref(false)

const RECENT_KEY = 'dof.recent-searches'
const recent = ref<string[]>([])
function loadRecent() {
  try { recent.value = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]') } catch { recent.value = [] }
}
function rememberSearch(term: string) {
  loadRecent()
  recent.value = [term, ...recent.value.filter((r) => r !== term)].slice(0, 5)
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(recent.value))
}
onMounted(loadRecent)

let timer: ReturnType<typeof setTimeout> | null = null
watch(q, (value) => {
  if (timer) clearTimeout(timer)
  active.value = -1
  if (value.trim().length < 2) { results.value = null; return }
  timer = setTimeout(async () => {
    searching.value = true
    try {
      results.value = await $fetch<Results>(`/api/v1/public/search?q=${encodeURIComponent(value.trim())}`)
    } catch { results.value = null } finally { searching.value = false }
  }, 200)
})

const options = computed<Option[]>(() => {
  if (!results.value) return []
  return [
    ...results.value.shops.map((s) => ({ to: `/s/${s.handle}`, label: s.name, context: s.tagline ?? 'a shop on DOF', group: 'Shops' })),
    ...results.value.products.map((p) => ({ to: `/s/${p.store_handle}/p/${p.id}`, label: p.title, context: p.store_name, group: 'Products' })),
    ...results.value.deals.map((d) => ({ to: `/s/${d.store_handle}/d/${d.id}`, label: d.headline, context: d.store_name, group: 'Deals' })),
    ...results.value.sparks.map((sp) => ({ to: `/s/${sp.store_handle}/sparks/${sp.id}`, label: sp.excerpt, context: sp.store_name, group: 'Updates' })),
  ]
})
const empty = computed(() => results.value !== null && options.value.length === 0 && !searching.value)

function go(option: Option) {
  rememberSearch(q.value.trim())
  open.value = false
  q.value = ''
  results.value = null
  void router.push(option.to)
}
function onKeydown(event: KeyboardEvent) {
  if (!open.value) return
  if (event.key === 'ArrowDown') { event.preventDefault(); active.value = Math.min(active.value + 1, options.value.length - 1) }
  else if (event.key === 'ArrowUp') { event.preventDefault(); active.value = Math.max(active.value - 1, -1) }
  else if (event.key === 'Enter' && active.value >= 0 && options.value[active.value]) { event.preventDefault(); go(options.value[active.value]!) }
  else if (event.key === 'Escape') { open.value = false; active.value = -1 }
}
function onBlur() {
  // let option mousedown land before closing
  setTimeout(() => (open.value = false), 150)
}
</script>

<template>
  <div class="relative w-full" @keydown="onKeydown">
    <div class="flex items-center gap-2 rounded-medium border border-line bg-surface-raised px-3 py-2 focus-within:focus-ring">
      <DofIcon name="search" size="sm" class="shrink-0 text-muted-foreground" />
      <input
        v-model="q"
        type="search"
        role="combobox"
        aria-label="Search the street"
        :aria-expanded="open && (options.length > 0 || recent.length > 0 || empty)"
        aria-controls="street-search-results"
        aria-autocomplete="list"
        :aria-activedescendant="active >= 0 ? `street-option-${active}` : undefined"
        placeholder="Search shops, products, deals…"
        class="w-full bg-transparent font-ui text-body text-foreground outline-none placeholder:text-muted-foreground"
        @focus="open = true; loadRecent()"
        @blur="onBlur"
      >
    </div>

    <div
      v-if="open && (options.length > 0 || empty || (q.trim().length < 2 && recent.length > 0))"
      id="street-search-results"
      class="absolute inset-x-0 top-full layer-overlay mt-1 max-h-96 overflow-y-auto rounded-large border border-line bg-surface p-2 shadow-raised"
    >
      <!-- recent searches (before typing) -->
      <template v-if="q.trim().length < 2 && recent.length > 0">
        <DofText role="caption" tone="muted" class="px-2 py-1">Recent searches</DofText>
        <button
          v-for="term in recent" :key="term"
          type="button"
          class="dof-interactive flex w-full items-center gap-2 rounded-medium px-2 py-1.5 text-start hover:bg-surface-raised focus-visible:focus-ring"
          @mousedown.prevent="q = term"
        >
          <DofIcon name="clock" size="sm" class="text-muted-foreground" />
          <DofText role="body">{{ term }}</DofText>
        </button>
      </template>

      <!-- grouped results -->
      <ul v-else-if="options.length > 0" role="listbox" aria-label="search results" class="flex list-none flex-col p-0">
        <template v-for="(option, i) in options" :key="option.to">
          <li v-if="i === 0 || options[i - 1]!.group !== option.group" aria-hidden="true">
            <DofText role="caption" tone="muted" class="block px-2 pb-1 pt-2">{{ option.group }}</DofText>
          </li>
          <li
            :id="`street-option-${i}`"
            role="option"
            :aria-selected="active === i"
            :class="active === i ? 'bg-accent/10' : 'hover:bg-surface-raised'"
            class="dof-interactive cursor-pointer rounded-medium px-2 py-1.5"
            @mousedown.prevent="go(option)"
            @mousemove="active = i"
          >
            <div class="flex items-baseline justify-between gap-2">
              <DofText role="body" class="min-w-0 flex-1 truncate">{{ option.label }}</DofText>
              <DofText role="caption" class="shrink-0 text-foreground/60">{{ option.context }}</DofText>
            </div>
          </li>
        </template>
      </ul>

      <!-- honest empty guidance -->
      <div v-else-if="empty" class="flex flex-col gap-1 px-2 py-3">
        <DofText role="body">Nothing on the street matches “{{ q.trim() }}”.</DofText>
        <DofText role="caption" tone="muted">Try a shorter word — or <NuxtLink to="/shops" class="underline underline-offset-4">browse every shop</NuxtLink>.</DofText>
      </div>
    </div>
  </div>
</template>
