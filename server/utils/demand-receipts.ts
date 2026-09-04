/**
 * Demand receipts (LS-7) — the maker HEARS the demand the Street creates.
 *
 * Evidence is the product. This is the ONE place that turns facts into
 * merchant-facing statements; the UI renders these sentences, it never invents
 * them. No new table, no analytics platform — pure bounded aggregation over
 * attention_facts + the engagement tables + publication times (all already
 * indexed, all under the 90-day retention law).
 *
 * THE FIVE QUESTIONS, and exactly which rows make each answer true:
 *  1. Did anyone find me?      distinct visitor_id (people) vs NULL visitor
 *                              (glances) over *_view rows for my stores, 7d.
 *  2. What brought them?       attention_facts.source breakdown; plus search
 *                              PHRASES from search_click rows whose clicked
 *                              subject is mine — k-anonymised (§privacy).
 *  3. What caught attention?   the subject (product/deal/spark) with the most
 *                              DISTINCT viewers, 7d — named only if still
 *                              visible now (counts are historical, names are
 *                              current-visibility-gated).
 *  4. What did they do?        follows / saves / fires this week — distinct
 *                              people, the explicit acts. saves surfaced for
 *                              the first time.
 *  5. Did anyone come back?    distinct visitors who viewed my stores on ≥2
 *                              distinct calendar days, 7d.
 *
 * LAWS. people = COUNT(DISTINCT visitor_id) — one hammering visitor is one
 * person; a NULL visitor is a glance, never a person. Attribution claims only
 * what an event proves: "arrived from search" (a search_click), never "search
 * caused a sale". Purchase→discovery attribution is DEFERRED (the event chain
 * doesn't prove it). Silence beats fake insight: a statement whose evidence is
 * too thin is omitted, not softened. Merchant isolation is the caller's
 * (resolveAccess); every query is scoped by business_id.
 */
import type { Tx } from '@platform/types'
import { asClient } from '@platform/db'

/** A phrase is shown only when at least this many DISTINCT visitors searched
 * it and clicked to this shop — k-anonymity so one person's query can't leak. */
export const SEARCH_MIN_PEOPLE = 3
const WINDOW = `interval '7 days'`
const VIEW_EVENTS = `('store_view', 'product_view', 'deal_view', 'spark_view')`

export interface DemandReceipts {
  /** true once ANY view (person or glance) exists in the window. */
  any_attention: boolean
  found: { people: number; glances: number }
  doors: Array<{ source: string; people: number }>
  searches: Array<{ phrase: string; people: number }>
  caught: { subject_type: string; subject_id: string; title: string; people: number } | null
  did: { follows: number; saves: number; fires: number }
  returned: number
  /** The honest sentences, derived here — the UI prints these verbatim. */
  sentences: string[]
}

const SOURCE_WORDS: Record<string, string> = {
  home: 'the Street feed', shops: 'the shop directory', storefront: 'other shops’ pages',
  search: 'search', direct: 'a direct link', lane: 'a lane', thread: 'a maker’s page',
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export async function demandReceipts(tx: Tx, businessId: string): Promise<DemandReceipts> {
  const client = asClient(tx)

  const [found, doors, searches, caught, engage, returned] = await Promise.all([
    // 1. found — people vs glances
    client.query<{ people: number; glances: number }>(
      `SELECT count(DISTINCT a.visitor_id) FILTER (WHERE a.visitor_id IS NOT NULL)::int AS people,
              count(*) FILTER (WHERE a.visitor_id IS NULL)::int AS glances
       FROM attention_facts a JOIN stores s ON s.id = a.store_id
       WHERE s.business_id = $1 AND a.occurred_at > now() - ${WINDOW}
         AND a.event_type IN ${VIEW_EVENTS}`, [businessId]),
    // 2a. doors — distinct people per source
    client.query<{ source: string; people: number }>(
      `SELECT a.source,
              count(DISTINCT a.visitor_id) FILTER (WHERE a.visitor_id IS NOT NULL)::int AS people
       FROM attention_facts a JOIN stores s ON s.id = a.store_id
       WHERE s.business_id = $1 AND a.occurred_at > now() - ${WINDOW}
         AND a.event_type IN ${VIEW_EVENTS}
       GROUP BY a.source HAVING count(DISTINCT a.visitor_id) FILTER (WHERE a.visitor_id IS NOT NULL) > 0
       ORDER BY people DESC`, [businessId]),
    // 2b. search phrases — clicked THROUGH to this shop, k-anonymised
    client.query<{ phrase: string; people: number }>(
      `SELECT a.query AS phrase, count(DISTINCT a.visitor_id)::int AS people
       FROM attention_facts a JOIN stores s ON s.id = a.store_id
       WHERE s.business_id = $1 AND a.event_type = 'search_click'
         AND a.query IS NOT NULL AND a.visitor_id IS NOT NULL
         AND a.occurred_at > now() - ${WINDOW}
       GROUP BY a.query HAVING count(DISTINCT a.visitor_id) >= ${SEARCH_MIN_PEOPLE}
       ORDER BY people DESC LIMIT 3`, [businessId]),
    // 3. caught — most-viewed subject by DISTINCT people, named only if still visible
    client.query<{ subject_type: string; subject_id: string; title: string; people: number }>(
      `WITH tops AS (
         SELECT a.subject_type, a.subject_id,
                count(DISTINCT a.visitor_id) FILTER (WHERE a.visitor_id IS NOT NULL)::int AS people
         FROM attention_facts a JOIN stores s ON s.id = a.store_id
         WHERE s.business_id = $1 AND a.occurred_at > now() - ${WINDOW}
           AND a.event_type IN ('product_view', 'deal_view', 'spark_view')
         GROUP BY a.subject_type, a.subject_id
         HAVING count(DISTINCT a.visitor_id) FILTER (WHERE a.visitor_id IS NOT NULL) > 0
         ORDER BY people DESC
       )
       SELECT t.subject_type, t.subject_id, t.people,
              CASE t.subject_type
                WHEN 'product' THEN (SELECT p.title FROM products p JOIN listings l ON l.product_id = p.id
                                     WHERE p.id = t.subject_id AND l.status = 'published' AND p.deleted_at IS NULL LIMIT 1)
                WHEN 'deal' THEN (SELECT d.headline FROM deals d WHERE d.id = t.subject_id AND d.status = 'published' AND d.ended_at IS NULL LIMIT 1)
                WHEN 'spark' THEN (SELECT left(sp.body, 60) FROM sparks sp WHERE sp.id = t.subject_id AND sp.status = 'published' LIMIT 1)
              END AS title
       FROM tops t
       WHERE (CASE t.subject_type
                WHEN 'product' THEN (SELECT p.title FROM products p JOIN listings l ON l.product_id = p.id
                                     WHERE p.id = t.subject_id AND l.status = 'published' AND p.deleted_at IS NULL LIMIT 1)
                WHEN 'deal' THEN (SELECT d.headline FROM deals d WHERE d.id = t.subject_id AND d.status = 'published' AND d.ended_at IS NULL LIMIT 1)
                WHEN 'spark' THEN (SELECT sp.id::text FROM sparks sp WHERE sp.id = t.subject_id AND sp.status = 'published' LIMIT 1)
              END) IS NOT NULL
       LIMIT 1`, [businessId]),
    // 4. did — explicit acts this week (distinct people by construction: UNIQUE(subject, visitor))
    client.query<{ follows: number; saves: number; fires: number }>(
      `SELECT
         (SELECT count(*)::int FROM store_follows f JOIN stores s ON s.id = f.store_id
          WHERE s.business_id = $1 AND f.visitor_id IS NOT NULL AND f.created_at > now() - ${WINDOW}) AS follows,
         (SELECT count(*)::int FROM deal_saves ds WHERE ds.business_id = $1 AND ds.visitor_id IS NOT NULL AND ds.created_at > now() - ${WINDOW}) AS saves,
         (SELECT count(DISTINCT (r.subject, r.visitor_id))::int FROM (
            SELECT dr.deal_id AS subject, dr.visitor_id FROM deal_reactions dr WHERE dr.business_id = $1 AND dr.visitor_id IS NOT NULL AND dr.created_at > now() - ${WINDOW}
            UNION ALL
            SELECT sr.spark_id, sr.visitor_id FROM spark_reactions sr WHERE sr.business_id = $1 AND sr.visitor_id IS NOT NULL AND sr.created_at > now() - ${WINDOW}
          ) r) AS fires`, [businessId]),
    // 5. returned — distinct visitors who viewed on ≥2 distinct calendar days
    client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM (
         SELECT a.visitor_id
         FROM attention_facts a JOIN stores s ON s.id = a.store_id
         WHERE s.business_id = $1 AND a.visitor_id IS NOT NULL AND a.occurred_at > now() - ${WINDOW}
           AND a.event_type IN ${VIEW_EVENTS}
         GROUP BY a.visitor_id HAVING count(DISTINCT date_trunc('day', a.occurred_at)) >= 2
       ) repeat`, [businessId]),
  ])

  const f = found.rows[0] ?? { people: 0, glances: 0 }
  const did = engage.rows[0] ?? { follows: 0, saves: 0, fires: 0 }
  const caughtRow = caught.rows[0] ?? null
  const returnedN = Number(returned.rows[0]?.n ?? 0)
  const doorRows = doors.rows.filter((d) => d.people > 0)
  const searchRows = searches.rows

  // ——— the sentences (silence beats fake insight; each line has a row behind it)
  const sentences: string[] = []
  if (f.people > 0) {
    const topDoor = doorRows[0]
    const via = topDoor ? ` — most through ${SOURCE_WORDS[topDoor.source] ?? topDoor.source}` : ''
    sentences.push(`${plural(f.people, 'person', 'people')} found your shop this week${via}.`)
  } else if (f.glances > 0) {
    sentences.push(`${plural(f.glances, 'glance')} passed through this week — glances, not yet people.`)
  }
  if (searchRows.length > 0) {
    sentences.push(`People found you searching for ${searchRows.map((s) => `“${s.phrase}”`).join(', ')}.`)
  }
  if (caughtRow && caughtRow.title) {
    const noun = caughtRow.subject_type === 'spark' ? 'update' : caughtRow.subject_type
    sentences.push(`Your ${noun} “${caughtRow.title.trim()}” drew the most attention — ${plural(caughtRow.people, 'person', 'people')}.`)
  }
  const acts: string[] = []
  if (did.fires > 0) acts.push(`${plural(did.fires, 'person', 'people')} reacted`)
  if (did.saves > 0) acts.push(`${plural(did.saves, 'person', 'people')} saved something`)
  if (did.follows > 0) acts.push(`${plural(did.follows, 'person', 'people')} started following`)
  if (acts.length > 0) sentences.push(`This week, ${acts.join(', ')}.`)
  if (returnedN > 0) sentences.push(`${plural(returnedN, 'person', 'people')} came back on another day.`)

  return {
    any_attention: f.people > 0 || f.glances > 0,
    found: { people: f.people, glances: f.glances },
    doors: doorRows,
    searches: searchRows,
    caught: caughtRow && caughtRow.title ? caughtRow : null,
    did, returned: returnedN, sentences,
  }
}
