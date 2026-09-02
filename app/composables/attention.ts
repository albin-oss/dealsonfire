/**
 * The attention beacon (LS-1) — how the street notices what people stop for.
 *
 * Client-only, quiet, batched. Laws mirrored from the server side:
 *  - passive attention NEVER mints identity (the beacon sends no credentials
 *    beyond cookies the browser already holds)
 *  - one impression per subject per page-load (module-level dedup)
 *  - explicit acts (follow/save/fire) have their own doors — never sent here
 *  - flushes are best-effort: a lost batch is lost, never retried into spam
 */
import { onBeforeUnmount, onMounted } from 'vue'

type SubjectType = 'store' | 'product' | 'deal' | 'spark'
type Source = 'home' | 'shops' | 'storefront' | 'search' | 'direct' | 'lane' | 'thread'

type AttentionEvent =
  | { type: 'feed_impression' | 'store_view' | 'product_view' | 'deal_view' | 'spark_view'; subject_type: SubjectType; subject_id: string; source: Source }
  | { type: 'search'; query: string; had_results: boolean; source: Source }
  | { type: 'search_click'; subject_type: SubjectType; subject_id: string; query: string; source: 'search' }
  | { type: 'lane_view'; lane: string; source: Source }
  | { type: 'lane_click'; subject_type: SubjectType; subject_id: string; lane: string; source: 'lane' }

const BATCH_MAX = 25
const FLUSH_AFTER_MS = 4000

const queue: AttentionEvent[] = []
const seen = new Set<string>() // per-page-load impression dedup
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushHooked = false
let lastSearch = ''
let searchNavigated = false
let laneNavigated = false
let threadNavigated = false

function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  if (queue.length === 0) return
  const events = queue.splice(0, queue.length)
  const body = JSON.stringify({ events })
  // sendBeacon survives navigation/tab-close; fetch keepalive is the fallback
  const sent = typeof navigator !== 'undefined' && navigator.sendBeacon
    ? navigator.sendBeacon('/api/v1/public/attention', new Blob([body], { type: 'application/json' }))
    : false
  if (!sent) {
    void fetch('/api/v1/public/attention', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true,
    }).catch(() => {})
  }
}

function enqueue(event: AttentionEvent) {
  if (import.meta.server) return
  if (!flushHooked) {
    flushHooked = true
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
    window.addEventListener('pagehide', flush)
  }
  queue.push(event)
  if (queue.length >= BATCH_MAX) { flush(); return }
  if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_AFTER_MS)
}

/** Where attention came from — derived from the page the visitor navigated FROM. */
export function attentionSource(fromPath: string | null | undefined): Source {
  if (searchNavigated) { searchNavigated = false; return 'search' }
  if (laneNavigated) { laneNavigated = false; return 'lane' }
  if (threadNavigated) { threadNavigated = false; return 'thread' }
  if (!fromPath) return 'direct'
  if (fromPath === '/' || fromPath === '/home') return 'home'
  if (fromPath === '/shops') return 'shops'
  if (fromPath.startsWith('/s/')) return 'storefront'
  return 'direct'
}

/** A subject was actually looked at (a detail page opened). */
export function recordView(kind: SubjectType, subjectId: string, source: Source) {
  const key = `view:${kind}:${subjectId}`
  if (seen.has(key)) return
  seen.add(key)
  const type = (`${kind}_view`) as 'store_view' | 'product_view' | 'deal_view' | 'spark_view'
  enqueue({ type, subject_type: kind, subject_id: subjectId, source })
}

/** A search the street answered (or honestly couldn't). Dedup on consecutive repeats. */
export function recordSearch(query: string, hadResults: boolean, source: Source = 'home') {
  const q = query.trim().toLowerCase()
  if (q.length < 2 || q === lastSearch) return
  lastSearch = q
  enqueue({ type: 'search', query: q.slice(0, 80), had_results: hadResults, source })
}

/** The next view arrived through a thread door (voice / nearby). */
export function markThreadHop() { threadNavigated = true }

/** Someone stepped into a lane. One per lane per page-load. */
let lastLane = ''
export function recordLaneView(lane: string, source: Source = 'home') {
  if (lane === lastLane) return
  lastLane = lane
  enqueue({ type: 'lane_view', lane, source })
}

/** A thing chosen from inside a lane — geography working. */
export function recordLaneClick(kind: SubjectType, subjectId: string, lane: string) {
  laneNavigated = true
  enqueue({ type: 'lane_click', subject_type: kind, subject_id: subjectId, lane, source: 'lane' })
}

/** A search result the visitor chose — the honest relevance judgment. */
export function recordSearchClick(kind: SubjectType, subjectId: string, query: string) {
  searchNavigated = true
  enqueue({ type: 'search_click', subject_type: kind, subject_id: subjectId, query: query.trim().toLowerCase().slice(0, 80), source: 'search' })
}

/**
 * Feed impressions: observe cards as they become genuinely visible (≥ half the
 * card, so a flick-past records nothing). One record per subject per page-load.
 */
export function useFeedImpressions(source: Source = 'home') {
  let observer: IntersectionObserver | null = null
  onMounted(() => {
    if (!('IntersectionObserver' in window)) return
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const el = entry.target as HTMLElement
        const kind = el.dataset.attentionType as SubjectType | undefined
        const id = el.dataset.attentionId
        if (!kind || !id) continue
        const key = `imp:${kind}:${id}`
        if (!seen.has(key)) {
          seen.add(key)
          enqueue({ type: 'feed_impression', subject_type: kind, subject_id: id, source })
        }
        observer?.unobserve(el)
      }
    }, { threshold: 0.5 })
  })
  onBeforeUnmount(() => { observer?.disconnect(); observer = null })
  return {
    observe(el: unknown) {
      if (observer && el instanceof HTMLElement && el.dataset.attentionId) observer.observe(el)
    },
  }
}
