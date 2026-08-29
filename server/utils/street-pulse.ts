/**
 * The street pulse (LS-4) — the first ranked discovery voice, and the ranking
 * DOF actually deserves rather than the cleverest one buildable.
 *
 * THE OBJECTIVE: "what is worth noticing around here right now?" — never
 * "what maximizes clicks". A SHARED street pulse: everyone sees substantially
 * the same ordering; nothing here is personalization.
 *
 * THE SCORE (explainable end to end):
 *   score = freshness + interest
 *   freshness = e^(-age_hours / HALF_LIFE_HOURS)        — the street moves
 *   interest  = PEOPLE_WEIGHT · ln(1 + people_7d)
 *             + STOPS_WEIGHT  · ln(1 + stops_7d)
 * where people/stops are DISTINCT IDENTIFIED VISITORS (see rm_street_pulse):
 * one person can never be a crowd, anonymous glances can never be people, and
 * log-damping means the tenth admirer moves the needle less than the first —
 * accumulated popularity cannot compound into a monopoly.
 *
 * SIGNALS DELIBERATELY EXCLUDED (each a decision, not an omission):
 *  - purchases: money is not attention; at current scale purchase-weighting
 *    would hand the street to whoever sold first (rich-get-richer)
 *  - impressions as positive evidence: SHOWN ≠ WANTED (LS-1's founding law);
 *    glances_7d exists only as the exposure denominator for exploration
 *  - anonymous views: no identity, no vote
 *  - dwell/scroll/cursor: surveillance, and DOF doesn't record them anyway
 *
 * HARD DIVERSITY (result-set construction, not a score bonus): at most
 * MAX_PER_STORE_PAGE items per store per page, never two consecutive items
 * from one store, never RUN_CAP consecutive items of one entity type.
 *
 * EXPLORATION (new-maker opportunity): every EXPLORE_EVERY-th slot is
 * reserved for an eligible under-exposed subject — store younger than
 * NEW_MAKER_DAYS (store age, from stores.published_at: republishing content
 * does NOT reset it) or under MIN_EXPOSURE_GLANCES of lifetime-window
 * exposure — ordered newest first. Deterministic, bounded, not pay-to-win.
 *
 * WATCH ITEM (LS-8, honest limits): distinct-person counting stops one person
 * becoming a crowd; it does NOT correct EXPOSURE BIAS — a heavily-shown item
 * has more chances to earn distinct people than a barely-shown one. Learning
 * section LS4b measures people-per-glance (sample-guarded) so judgment can
 * see the bias; the formula here must not consume such ratios until real
 * cohort evidence justifies a change.
 *
 * FALLBACK LAW: if the projection is absent or empty, the street voice
 * degrades to chronology (the caller renders the Newest stream) — never a
 * closed door.
 */
import type pg from 'pg'
import type { Tx } from '@platform/types'
import { asClient } from '@platform/db'
import type { ProjectionDefinition } from '@platform/projection-registry'

/** Every ranking constant, named, in one place. Change = reviewed diff. */
export const PULSE = {
  /** Freshness half-life-ish: at 72h an item's freshness term has fallen to ~1/e·. */
  HALF_LIFE_HOURS: 72,
  /** Weight of distinct intentional people (follows/saves/fires/clicks). */
  PEOPLE_WEIGHT: 0.35,
  /** Weight of distinct identified viewers — meaningful but weaker than intent. */
  STOPS_WEIGHT: 0.10,
  /** Cue threshold: below three distinct people, no social phrasing at all. */
  PEOPLE_CUE_MIN: 3,
  /** Every Nth street slot belongs to exploration. */
  EXPLORE_EVERY: 4,
  /** Under this many 7-day glances a subject counts as under-exposed. */
  MIN_EXPOSURE_GLANCES: 12,
  /** A store this young is a new maker (store age — content cycling can't reset it). */
  NEW_MAKER_DAYS: 30,
  /** Street page size and the candidate pool it is assembled from. */
  PAGE: 24, CANDIDATES: 96,
  /** Diversity: per-store cap per page, and no two consecutive same-store items. */
  MAX_PER_STORE_PAGE: 3,
  /** No more than this many consecutive items of one entity type. */
  TYPE_RUN_CAP: 2,
} as const

/**
 * The projection build: one deterministic aggregate over authoritative facts
 * (attention_facts + the four engagement tables + publication times). Full
 * recompute — idempotent and replayable by construction: same facts, same
 * rows, byte for byte. Visibility is NOT baked in here; reads re-check it so
 * a hold works instantly without a rebuild.
 */
async function buildPulse(tx: Tx, table: string): Promise<void> {
  await asClient(tx).query(`
    INSERT INTO ${table} (subject_type, subject_id, store_id, published_at, people_7d, stops_7d, glances_7d, built_at)
    WITH subjects AS (
      SELECT 'store'::text AS subject_type, s.id AS subject_id, s.id AS store_id, s.published_at
      FROM stores s WHERE s.published_at IS NOT NULL AND s.deleted_at IS NULL
      UNION ALL
      SELECT 'product', l.product_id, l.channel_id, l.published_at
      FROM listings l WHERE l.status = 'published'
      UNION ALL
      SELECT 'deal', d.id, d.channel_id, d.published_at
      FROM deals d WHERE d.status = 'published' AND d.ended_at IS NULL
      UNION ALL
      SELECT 'spark', sp.id, sp.channel_id, sp.published_at
      FROM sparks sp WHERE sp.status = 'published'
    ),
    intent AS (          -- distinct identified INTENTIONAL actors per subject
      SELECT subject_type, subject_id, count(DISTINCT visitor_id)::int AS people FROM (
        SELECT 'deal' AS subject_type, deal_id AS subject_id, visitor_id
        FROM deal_reactions WHERE created_at > now() - interval '7 days'
        UNION
        SELECT 'deal', deal_id, visitor_id FROM deal_saves WHERE created_at > now() - interval '7 days'
        UNION
        SELECT 'spark', spark_id, visitor_id FROM spark_reactions WHERE created_at > now() - interval '7 days'
        UNION
        SELECT 'store', store_id, visitor_id FROM store_follows WHERE created_at > now() - interval '7 days'
        UNION
        SELECT subject_type, subject_id, visitor_id FROM attention_facts
        WHERE event_type IN ('search_click', 'lane_click') AND visitor_id IS NOT NULL
          AND occurred_at > now() - interval '7 days'
      ) acts GROUP BY subject_type, subject_id
    ),
    stops AS (           -- distinct identified viewers
      SELECT subject_type, subject_id, count(DISTINCT visitor_id)::int AS stopped
      FROM attention_facts
      WHERE event_type IN ('store_view', 'product_view', 'deal_view', 'spark_view')
        AND visitor_id IS NOT NULL AND occurred_at > now() - interval '7 days'
      GROUP BY subject_type, subject_id
    ),
    glances AS (         -- raw exposure, identified or not
      SELECT subject_type, subject_id, count(*)::int AS glanced
      FROM attention_facts
      WHERE event_type = 'feed_impression' AND occurred_at > now() - interval '7 days'
      GROUP BY subject_type, subject_id
    )
    SELECT sub.subject_type, sub.subject_id, sub.store_id, sub.published_at,
           coalesce(i.people, 0), coalesce(st.stopped, 0), coalesce(g.glanced, 0), now()
    FROM subjects sub
    LEFT JOIN intent i ON i.subject_type = sub.subject_type AND i.subject_id = sub.subject_id
    LEFT JOIN stops st ON st.subject_type = sub.subject_type AND st.subject_id = sub.subject_id
    LEFT JOIN glances g ON g.subject_type = sub.subject_type AND g.subject_id = sub.subject_id`)
}

export const streetPulseProjection: ProjectionDefinition = {
  name: 'rm_street_pulse',
  version: 1,
  sourceEventTypes: ['attention_facts', 'deal_reactions', 'deal_saves', 'spark_reactions', 'store_follows', 'publications'],
  schemaSql: (table) => `
    CREATE TABLE ${table} (
      subject_type text NOT NULL CHECK (subject_type IN ('store', 'product', 'deal', 'spark')),
      subject_id   uuid NOT NULL,
      store_id     uuid NOT NULL,
      published_at timestamptz NOT NULL,
      people_7d    int NOT NULL DEFAULT 0,
      stops_7d     int NOT NULL DEFAULT 0,
      glances_7d   int NOT NULL DEFAULT 0,
      built_at     timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (subject_type, subject_id)
    );
    CREATE INDEX idx_${table}_store ON ${table} (store_id);
    CREATE INDEX idx_${table}_fresh ON ${table} (published_at DESC);`,
  build: buildPulse,
}

// ————————————————————————————————————————————— the street read

export interface StreetItem {
  subject_type: 'store' | 'product' | 'deal' | 'spark'
  id: string
  title: string
  text: string | null
  store_handle: string
  store_name: string
  price_minor: number | null
  currency: string | null
  image_url: string | null
  published_at: string
  /** Truthful, threshold-gated reasons — the UI shows cues only from these. */
  reasons: Array<'fresh' | 'people_stopping' | 'new_maker' | 'exploration'>
}

export interface StreetFeed {
  mode: 'pulse' | 'chronology'
  items: StreetItem[]
}

interface Candidate {
  subject_type: StreetItem['subject_type']
  subject_id: string
  store_id: string
  published_at: string
  people_7d: number
  score: number
  store_is_new: boolean
  explore: boolean
  title: string
  text: string | null
  store_handle: string
  store_name: string
  price_minor: number | null
  currency: string | null
  image_url: string | null
  reasons?: StreetItem['reasons']
}

/**
 * Candidates: pulse rows joined BACK to live entities — visibility is decided
 * here, at read time, so enforcement holds work instantly on a stale
 * projection. Score in SQL (from named constants), assembly in TypeScript.
 */
const CANDIDATE_SQL = `
  WITH scored AS (
    SELECT rp.subject_type, rp.subject_id, rp.store_id, rp.published_at,
           rp.people_7d, rp.stops_7d, rp.glances_7d,
           exp(-extract(epoch FROM (now() - rp.published_at)) / 3600.0 / $1)
             + $2 * ln(1 + rp.people_7d) + $3 * ln(1 + rp.stops_7d) AS score,
           (ss.published_at > now() - ($4 || ' days')::interval) AS store_is_new,
           (ss.published_at > now() - ($4 || ' days')::interval OR rp.glances_7d < $5) AS explore
    FROM rm_street_pulse rp
    JOIN stores ss ON ss.id = rp.store_id
      AND ss.status = 'live' AND ss.enforcement_hold = 'none' AND ss.deleted_at IS NULL
  )
  SELECT sc.*,
         s.handle AS store_handle, s.name AS store_name,
         CASE sc.subject_type
           WHEN 'store' THEN s.name
           WHEN 'product' THEN p.title
           WHEN 'deal' THEN d.headline
           ELSE left(sp.body, 140) END AS title,
         CASE sc.subject_type
           WHEN 'store' THEN b.voice->>'tone'
           WHEN 'product' THEN left(coalesce(p.description->>'content', ''), 140)
           WHEN 'deal' THEN left(coalesce(d.story, ''), 140)
           ELSE NULL END AS text,
         CASE WHEN sc.subject_type = 'product' THEN
           (SELECT min(v.price_amount)::int FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = sc.subject_id) END AS price_minor,
         CASE WHEN sc.subject_type = 'product' THEN
           (SELECT min(v.price_currency) FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = sc.subject_id) END AS currency,
         img.url AS image_url
  FROM scored sc
  JOIN stores s ON s.id = sc.store_id
  LEFT JOIN brand_kits b ON b.owner_type = 'store' AND b.owner_id = s.id
  LEFT JOIN products p ON sc.subject_type = 'product' AND p.id = sc.subject_id
    AND p.status <> 'archived' AND p.deleted_at IS NULL
  LEFT JOIN deals d ON sc.subject_type = 'deal' AND d.id = sc.subject_id AND d.status = 'published'
  LEFT JOIN sparks sp ON sc.subject_type = 'spark' AND sp.id = sc.subject_id AND sp.status = 'published'
  LEFT JOIN LATERAL (
    SELECT ma.url FROM product_media pm JOIN media_assets ma ON ma.id = pm.media_id
    WHERE sc.subject_type = 'product' AND pm.product_id = sc.subject_id
    ORDER BY (pm.role = 'hero') DESC, pm.position ASC LIMIT 1
  ) img ON true
  WHERE (sc.subject_type = 'store')
     OR (sc.subject_type = 'product' AND p.id IS NOT NULL)
     OR (sc.subject_type = 'deal' AND d.id IS NOT NULL)
     OR (sc.subject_type = 'spark' AND sp.id IS NOT NULL)`

export async function readStreet(tx: Tx): Promise<StreetFeed> {
  const client = asClient(tx)
  const { rows: reg } = await client.query<{ t: string | null }>(`SELECT to_regclass('rm_street_pulse') AS t`)
  if (reg[0]?.t === null) return { mode: 'chronology', items: [] } // fallback law: degrade, never fail closed

  const params = [PULSE.HALF_LIFE_HOURS, PULSE.PEOPLE_WEIGHT, PULSE.STOPS_WEIGHT, PULSE.NEW_MAKER_DAYS, PULSE.MIN_EXPOSURE_GLANCES]
  const { rows } = await client.query<Candidate>(
    `${CANDIDATE_SQL} ORDER BY sc.score DESC, sc.published_at DESC, sc.subject_id DESC LIMIT ${PULSE.CANDIDATES}`, params)
  if (rows.length === 0) return { mode: 'chronology', items: [] }

  // exploration pool: eligible + under-shown, NEWEST first (not score — that's the point)
  const explorePool = rows.filter((r) => r.explore)
    .sort((a, b) => (a.published_at < b.published_at ? 1 : -1))

  const page: Candidate[] = []
  const perStore = new Map<string, number>()
  const used = new Set<string>()
  const key = (r: Candidate) => `${r.subject_type}:${r.subject_id}`

  const fits = (r: Candidate) => {
    if (used.has(key(r))) return false
    if ((perStore.get(r.store_id) ?? 0) >= PULSE.MAX_PER_STORE_PAGE) return false
    const last = page[page.length - 1]
    if (last && last.store_id === r.store_id) return false // never two consecutive from one shop
    const run = [...page].reverse().findIndex((p) => p.subject_type !== r.subject_type)
    const runLen = run === -1 ? page.length : run
    if (runLen >= PULSE.TYPE_RUN_CAP) return false
    return true
  }
  const take = (r: Candidate) => {
    used.add(key(r))
    perStore.set(r.store_id, (perStore.get(r.store_id) ?? 0) + 1)
    page.push(r)
  }

  while (page.length < PULSE.PAGE) {
    const slot = page.length + 1
    const wantExplore = slot % PULSE.EXPLORE_EVERY === 0
    const pool = wantExplore ? [...explorePool, ...rows] : rows // explore slot falls back to the main pool when dry
    const next = pool.find(fits)
    if (!next) break
    take(next)
  }

  const now = Date.now()
  const items: StreetItem[] = page.map((r) => {
    const reasons: StreetItem['reasons'] = []
    const ageH = (now - new Date(r.published_at).getTime()) / 3600_000
    if (ageH < 48) reasons.push('fresh')
    if ((r as unknown as { people_7d: number }).people_7d >= PULSE.PEOPLE_CUE_MIN) reasons.push('people_stopping')
    // under-exposure keeps a thing ELIGIBLE for exploration slots but earns no
    // label — a cue is a claim, and only real newness may claim "New maker"
    if (r.store_is_new) reasons.push('new_maker')
    return {
      subject_type: r.subject_type, id: r.subject_id, title: r.title, text: r.text,
      store_handle: r.store_handle, store_name: r.store_name,
      price_minor: r.price_minor, currency: r.currency, image_url: r.image_url,
      published_at: r.published_at, reasons,
    }
  })
  return { mode: 'pulse', items }
}

/** Rebuild driven on the cron clock — cheap full recompute at current scale. */
export async function rebuildStreetPulse(pool: pg.Pool, registry: { rebuild(pool: pg.Pool, name: string): Promise<void> }): Promise<void> {
  await registry.rebuild(pool, 'rm_street_pulse')
}
