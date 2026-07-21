<script setup lang="ts">
/**
 * /ignite — the Five-Minute Store, implemented (ADR-001 §9 frozen score; ADR-005 §3;
 * UX-BIBLE §8). Full-screen ceremony: chrome gone, one exit that keeps everything
 * (drafts persist; re-entry resumes). Six movements: welcome → idea → mirror →
 * first thing → reveal (the Bundle) → launch (real aggregates via the kernel APIs).
 */
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import {
  DofButton, DofText, DofTextarea, DofInput, DofMoneyInput, DofChip, DofProblem,
  DofProposalCard, DofCheckbox, DofDivider, DofIcon, DofHandleBadge,
  type HandleBadgeState, type IconName,
  TRANSITIONS, DURATIONS_MS, useReducedMotion, announce, cx,
} from '@ds/index'
import { ruleBasedIntelligence, slugify } from '../composables/ignite/intelligence'
import { useIgniteJourney, chosenIdentity, clearIgniteDraft, type IgniteState } from '../composables/ignite/journey'
import { createLaunchService, LaunchError, devUserId, type LaunchProgress } from '../composables/ignite/launch'
import StorefrontPreview from '../components/ignite/StorefrontPreview.vue'
import IgniteImportDoor from '../components/ignite/IgniteImportDoor.vue'

definePageMeta({ layout: false })
useHead({ title: 'Ignite — DOF', htmlAttrs: { 'data-scope': 'workspace' } })

const router = useRouter()
const journey = useIgniteJourney()
const state = journey.state
const engine = ruleBasedIntelligence

const IDEA_CHIPS = ['things I make', 'things I find', 'my services', 'digital stuff']

// client-only route (ssr:false): the draft resumes before first paint — re-entry
// lands exactly where the merchant left off, with no welcome flash
await journey.resume()

const reading = computed(() => engine.readIdea(state.value.idea))
const identity = computed(() => chosenIdentity(state.value))
const heroLine = computed(() => (state.value.idea.trim() ? `${state.value.idea.trim().replace(/\.$/, '')} — made with care.` : ''))

async function toMirror() {
  if (state.value.identities.length === 0 || state.value.idea !== lastDraftedIdea.value) {
    state.value.identities = engine.draftIdentities(state.value.idea)
    state.value.identityIndex = null
    lastDraftedIdea.value = state.value.idea
  }
  await journey.next()
}
const lastDraftedIdea = ref('')

async function toReveal() {
  if (identity.value) {
    state.value.revealItems = engine.draftReveal(reading.value, identity.value)
  }
  await journey.next()
}

// ——— reveal quartet (every line cites the merchant's own input — honesty law)
const revealEvidence = computed(() => [
  `You said: “${state.value.idea.trim()}” — that reads as ${reading.value.category.toLowerCase()}`,
  `You chose the “${identity.value?.name}” identity`,
  ...(state.value.importedProducts.length > 0 ? [`Your file brought ${state.value.importedProducts.length} products along`] : []),
])
const revealAssumptions = computed(() => [
  reading.value.fulfillment === 'physical'
    ? 'Assumes you pack and send orders yourself to start'
    : reading.value.fulfillment === 'digital'
      ? 'Assumes customers download instantly after purchase'
      : 'Assumes you deliver the service personally',
  'Prices stay in euros until you tell DOF otherwise',
])
const showAdvanced = ref(false)
const basicItems = computed(() => state.value.revealItems.filter((i) => !i.advanced))
const advancedItems = computed(() => state.value.revealItems.filter((i) => i.advanced))

// ——— handle availability (UX-IGNITE Phase 3): advisory, debounced, never a dead end.
// The badge reflects the handle the launch would actually claim; picking a suggestion
// records an explicit override the launch saga honors.
const effectiveHandle = computed(() => {
  const override = state.value.handleOverride?.trim()
  if (override) return override
  const name = state.value.customName.trim() || identity.value?.name || ''
  return name ? slugify(name) : ''
})
const handleState = ref<HandleBadgeState>('idle')
const handleSuggestions = ref<string[]>([])
let availabilityTimer: ReturnType<typeof setTimeout> | undefined

async function checkHandle(handle: string) {
  if (!handle) { handleState.value = 'idle'; return }
  handleState.value = 'checking'
  try {
    const res = await $fetch<{ available: boolean; reason: string; suggestions: string[] }>(
      `/api/v1/handles/${encodeURIComponent(handle)}/availability`,
      { headers: { 'x-dof-user-id': devUserId() } },
    )
    if (handle !== effectiveHandle.value) return // stale response — a newer check owns the badge
    handleState.value = res.available ? 'available' : res.reason === 'invalid_format' ? 'invalid' : 'taken'
    handleSuggestions.value = res.available ? [] : res.suggestions
  } catch {
    handleState.value = 'idle' // advisory only — silence over noise; the launch fallback still guards
  }
}
watch(effectiveHandle, (handle) => {
  clearTimeout(availabilityTimer)
  handleState.value = handle ? 'checking' : 'idle'
  availabilityTimer = setTimeout(() => void checkHandle(handle), 450)
})
onBeforeUnmount(() => clearTimeout(availabilityTimer))

function pickSuggestion(suggestion: string) {
  state.value.handleOverride = suggestion
  announce(`Handle set to ${suggestion}`)
}
// a new name invalidates a previously picked handle — the suggestion belonged to the old one
watch(() => [state.value.customName, state.value.identityIndex], () => { state.value.handleOverride = '' })

// ——— launch (real saga against the kernel APIs), narrated (UX-IGNITE-002 §F)
const fetcher = (path: string, options: { method: 'POST' | 'PUT'; body: Record<string, unknown>; headers: Record<string, string> }) =>
  $fetch<Record<string, unknown>>(path, options)
const launchService = createLaunchService(fetcher)
const launching = ref(false)
const launchProblem = ref<LaunchError | null>(null)
const reducedMotion = useReducedMotion()

/** The narration log: the real kernel steps, appearing as they run, resolving to ✓.
 *  A retry RESUMES it — completed steps stay checked because the saga never re-runs them. */
const narration = ref<Array<{ step: LaunchProgress['step']; message: string; done: boolean }>>([])
/** Session-only celebration gate: a resumed, already-launched draft never re-animates. */
const justLaunched = ref(false)

async function approveAndLaunch() {
  await journey.next() // reveal → launch screen
  await runLaunch()
}

async function runLaunch() {
  if (!identity.value || state.value.launched) return
  launching.value = true
  launchProblem.value = null
  try {
    const result = await launchService.launch(state.value, identity.value, reading.value.fulfillment, (p: LaunchProgress) => {
      // narration: previous line resolves to ✓ as the next begins (coalesces naturally
      // when the kernel is fast — honesty first, drama second)
      for (const line of narration.value) line.done = true
      const existing = narration.value.find((l) => l.step === p.step)
      if (existing) existing.done = false
      else narration.value.push({ step: p.step, message: p.message, done: false })
      announce(p.message)
    })
    for (const line of narration.value) line.done = true
    state.value.launched = { ...result }
    justLaunched.value = true
    await journey.persist()
    announce(`${identity.value.name} is live at dof.dev/${result.handle}.`)
  } catch (error) {
    launchProblem.value = error instanceof LaunchError ? error : new LaunchError('business', 'Something unexpected happened — trying again is safe.')
  } finally {
    launching.value = false
  }
}

// ——— the single Next Opportunity (Phase 3 refinement): contextual, one, never a checklist
const nextOpportunity = computed<{ icon: IconName; title: string; why: string; action: string; run: () => unknown } | null>(() => {
  if (!state.value.launched) return null
  return state.value.launched.productId
    ? {
        icon: 'send', title: 'Share your store',
        why: 'Your first visitor is one link away — send it to someone who’d smile.',
        action: 'Copy the link', run: copyStoreLink,
      }
    : {
        icon: 'plus', title: 'Put something on the shelf',
        why: 'The doors are open — give visitors one thing to fall for.',
        action: 'Add a product', run: () => void router.push('/products'),
      }
})
async function copyStoreLink() {
  const url = `${window.location.origin}/s/${state.value.launched!.handle}`
  try {
    await navigator.clipboard.writeText(url)
    announce('Store link copied.')
  } catch {
    announce(url) // clipboard denied — at least surface it
  }
}

function exitToWorkspace() {
  void router.push('/')
}

function finish() {
  clearIgniteDraft()
  void router.push('/')
}

const stepWord = computed(() => {
  const words: Record<string, string> = {
    welcome: 'about 4 minutes, 3 questions',
    idea: 'question 1 of 3',
    mirror: 'question 2 of 3',
    'first-thing': 'question 3 of 3 — the last one',
    reveal: 'nothing left to fill in',
    launch: '',
  }
  return words[journey.current.value.id] ?? ''
})
</script>

<template>
  <div class="fixed inset-0 layer-base flex flex-col overflow-y-auto bg-surface" data-scope="workspace">
    <header class="flex items-center justify-between gap-3 px-4 py-3">
      <span class="flex items-center gap-2 font-ui text-caption text-faint-foreground">
        <DofIcon name="flame" size="sm" class="text-ember" />
        Ignite
        <span v-if="stepWord">· {{ stepWord }}</span>
      </span>
      <DofButton v-if="!state.launched" size="sm" variant="ghost" tone="neutral" icon="x" @click="exitToWorkspace">
        Save & exit
      </DofButton>
    </header>

    <main class="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 pb-16" aria-live="polite">
      <!-- explicit duration: timer-driven completion survives rAF throttling in occluded tabs -->
      <Transition v-bind="TRANSITIONS.settle" :duration="{ enter: DURATIONS_MS.deliberate, leave: DURATIONS_MS.quick }" mode="out-in">
        <!-- ——— welcome -->
        <section v-if="journey.current.value.id === 'welcome'" key="welcome" class="flex flex-col gap-4">
          <DofText role="display" as="h1">Turn what you love into a store.</DofText>
          <DofText role="body" tone="muted" reading>
            Three questions — what you sell, what it's called, one thing to put on the shelf.
            Ignite drafts everything else: your look, your pages, your policies. You approve; nothing locks;
            everything can be changed later. About four minutes.
          </DofText>
          <div class="flex items-center gap-3">
            <DofButton tone="ember" icon="flame" size="lg" class="whitespace-nowrap" @click="journey.next()">Let's start</DofButton>
            <DofText role="caption" tone="faint">Your draft saves itself — leave anytime.</DofText>
          </div>
        </section>

        <!-- ——— question 1: the idea -->
        <section v-else-if="journey.current.value.id === 'idea'" key="idea" class="flex flex-col gap-4">
          <DofText role="headline" as="h1">What do you want to sell?</DofText>
          <DofTextarea
            v-model="state.idea"
            label="What do you want to sell?"
            label-hidden
            :rows="2"
            placeholder="my knitted baby blankets…"
            :error="journey.blockedReason.value ?? undefined"
          />
          <div class="flex flex-wrap gap-2" aria-label="ideas to start from">
            <DofChip v-for="chip in IDEA_CHIPS" :key="chip" :label="chip" selectable :selected="state.idea === chip" @toggle="state.idea = chip" />
          </div>
          <IgniteImportDoor :state="state" />
          <div class="flex justify-end">
            <DofButton tone="accent" icon="arrow-right" @click="toMirror()">Continue</DofButton>
          </div>
        </section>

        <!-- ——— question 2: the mirror -->
        <section v-else-if="journey.current.value.id === 'mirror'" key="mirror" class="flex flex-col gap-4">
          <DofText role="headline" as="h1">This is your business.</DofText>
          <DofText role="body" tone="muted">Three versions of it — pick the one that feels like yours.</DofText>
          <div class="grid gap-3 regular:grid-cols-3" role="radiogroup" aria-label="choose your store identity">
            <button
              v-for="(draft, index) in state.identities"
              :key="draft.name"
              type="button"
              role="radio"
              :aria-checked="state.identityIndex === index"
              :class="cx(
                'dof-interactive rounded-large border-2 p-1 text-start transition-colors tempo-instant ease-settle focus-visible:focus-ring',
                state.identityIndex === index ? 'border-accent' : 'border-line hover:border-faint-foreground',
              )"
              @click="state.identityIndex = index"
            >
              <StorefrontPreview :identity="draft" :hero-line="heroLine" compact-card />
            </button>
          </div>
          <DofInput
            v-model="state.customName"
            label="Or name it yourself"
            placeholder="Type your own name — the look stays"
          />
          <DofHandleBadge
            v-if="effectiveHandle"
            :handle="effectiveHandle"
            :state="handleState"
            :suggestions="handleSuggestions"
            @pick="pickSuggestion"
          />
          <DofText v-if="journey.blockedReason.value" role="caption" class="text-critical" aria-live="polite">
            {{ journey.blockedReason.value }}
          </DofText>
          <div class="flex justify-between">
            <DofButton variant="ghost" tone="neutral" icon="arrow-left" @click="journey.back()">Back</DofButton>
            <DofButton tone="accent" icon="arrow-right" @click="toReveal()">Continue</DofButton>
          </div>
        </section>

        <!-- ——— question 3: the first thing -->
        <section v-else-if="journey.current.value.id === 'first-thing'" key="first-thing" class="flex flex-col gap-4">
          <DofText role="headline" as="h1">Show me one thing you'd sell.</DofText>
          <DofText v-if="state.importedProducts.length > 0" role="body" tone="muted">
            Your file brought {{ state.importedProducts.length }} products — here's the first one; the rest follow it in.
          </DofText>
          <DofText v-else role="body" tone="muted">
            One is enough — it turns the store from an idea into a fact.
          </DofText>
          <DofInput v-model="state.productTitle" label="What is it called?" placeholder="Lavender baby blanket" />
          <DofMoneyInput
            v-model="state.priceMinor"
            label="Starting price"
            currency="EUR"
            description="Price is yours — start where it feels fair. You can change it anytime, and no one sees it until you launch."
          />
          <DofText v-if="journey.blockedReason.value" role="caption" class="text-critical" aria-live="polite">
            {{ journey.blockedReason.value }}
          </DofText>
          <div class="flex justify-between">
            <DofButton variant="ghost" tone="neutral" icon="arrow-left" @click="journey.back()">Back</DofButton>
            <DofButton tone="accent" icon="arrow-right" @click="journey.next()">Continue</DofButton>
          </div>
        </section>

        <!-- ——— the reveal: one Bundle, one signature -->
        <section v-else-if="journey.current.value.id === 'reveal' && identity" key="reveal" class="flex flex-col gap-4">
          <DofProposalCard
            :intent="`Set up “${identity.name}” around what you told me.`"
            :evidence="revealEvidence"
            :assumptions="revealAssumptions"
            :confidence="reading.matched ? 'confident' : 'estimate'"
            r-class="R2"
            approve-label="Make it my store"
            @approve="approveAndLaunch()"
            @decline="journey.back()"
          >
            <template #preview>
              <StorefrontPreview :identity="identity" :hero-line="heroLine" :product-title="state.productTitle" :price-minor="state.priceMinor" />
            </template>
            <div class="flex flex-col gap-2">
              <DofCheckbox
                v-for="item in basicItems"
                :key="item.id"
                v-model="item.included"
                :label="item.label"
                :description="item.detail"
              />
              <DofDivider v-if="advancedItems.length > 0" />
              <button
                v-if="advancedItems.length > 0"
                type="button"
                class="dof-interactive w-fit rounded-small px-1 text-caption text-faint-foreground focus-visible:focus-ring"
                :aria-expanded="showAdvanced"
                @click="showAdvanced = !showAdvanced"
              >
                {{ showAdvanced ? 'Hide advanced' : 'Advanced (for experienced merchants)' }}
              </button>
              <template v-if="showAdvanced">
                <DofCheckbox
                  v-for="item in advancedItems"
                  :key="item.id"
                  v-model="item.included"
                  :label="item.label"
                  :description="item.detail"
                />
              </template>
            </div>
          </DofProposalCard>
        </section>

        <!-- ——— launch: the becoming (UX-IGNITE-002 §F — the one celebration in DOF) -->
        <section v-else-if="journey.current.value.id === 'launch'" key="launch" class="flex flex-col items-center gap-5 text-center">
          <!-- arrived: the preview grows into the store -->
          <template v-if="state.launched && identity">
            <Transition
              appear
              enter-active-class="ease-settle"
              :enter-from-class="justLaunched && !reducedMotion ? 'scale-90 opacity-0' : 'opacity-0'"
              enter-to-class="scale-100 opacity-100"
              :style="{ transitionDuration: `${justLaunched && !reducedMotion ? DURATIONS_MS.celebration : DURATIONS_MS.instant}ms` }"
            >
              <div class="w-full max-w-xl transition-[transform,opacity]" :style="{ transitionDuration: `${justLaunched && !reducedMotion ? DURATIONS_MS.celebration : DURATIONS_MS.instant}ms` }">
                <StorefrontPreview :identity="identity" :hero-line="heroLine" :product-title="state.productTitle" :price-minor="state.priceMinor" />
              </div>
            </Transition>
            <DofText role="display" as="h1">You're open.</DofText>
            <div class="flex flex-col items-center gap-1">
              <DofText role="title" as="p">dof.dev/{{ state.launched.handle }}</DofText>
              <DofText role="caption" tone="muted">You started a business today. That's the whole sentence.</DofText>
            </div>
            <div class="flex flex-wrap items-center justify-center gap-3">
              <NuxtLink :to="`/s/${state.launched.handle}`" class="contents">
                <DofButton tone="ember" icon="arrow-right" size="lg">Visit your store</DofButton>
              </NuxtLink>
              <DofButton variant="ghost" tone="neutral" @click="finish()">Open my workspace</DofButton>
            </div>
            <!-- the single Next Opportunity — a trusted guide, never a checklist -->
            <div
              v-if="nextOpportunity"
              class="mt-2 flex w-full max-w-md items-start gap-3 rounded-large border border-line bg-surface-raised p-4 text-start"
            >
              <DofIcon :name="nextOpportunity.icon" size="sm" class="mt-0.5 shrink-0 text-muted-foreground" />
              <div class="flex flex-1 flex-col gap-1">
                <DofText role="emphasis" as="h2">{{ nextOpportunity.title }}</DofText>
                <DofText role="caption" tone="muted">{{ nextOpportunity.why }}</DofText>
              </div>
              <DofButton size="sm" variant="soft" tone="accent" @click="nextOpportunity.run()">
                {{ nextOpportunity.action }}
              </DofButton>
            </div>
          </template>

          <!-- paused: calm, resumable — the narration keeps its ✓s on retry -->
          <template v-else-if="launchProblem">
            <DofProblem
              class="w-full text-start"
              :title="`We paused at the ${launchProblem.step} step.`"
              :detail="launchProblem.message"
              retryable
              :retrying="launching"
              @retry="runLaunch()"
            />
            <DofButton variant="ghost" tone="neutral" @click="exitToWorkspace()">Keep my draft & exit</DofButton>
          </template>

          <!-- becoming: the held moment — the real steps, narrated -->
          <template v-else>
            <div v-if="identity" class="w-full max-w-md">
              <StorefrontPreview :identity="identity" :hero-line="heroLine" :product-title="state.productTitle" :price-minor="state.priceMinor" compact-card />
            </div>
            <ul class="flex w-full max-w-md list-none flex-col gap-2 p-0 text-start" aria-label="opening your store">
              <li v-for="line in narration" :key="line.step" class="flex items-center gap-2">
                <DofIcon
                  :name="line.done ? 'check' : 'loader-circle'"
                  size="sm"
                  :class="line.done ? 'text-positive' : 'animate-spin text-muted-foreground'"
                />
                <DofText role="body" :tone="line.done ? 'muted' : undefined">{{ line.message }}</DofText>
              </li>
              <li v-if="narration.length === 0" class="flex items-center gap-2">
                <DofIcon name="loader-circle" size="sm" class="animate-spin text-muted-foreground" />
                <DofText role="body">Setting the table…</DofText>
              </li>
            </ul>
          </template>
        </section>
      </Transition>
    </main>
  </div>
</template>
