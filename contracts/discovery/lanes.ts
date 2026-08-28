/**
 * The street's lanes (LS-3) — shared geography, not personalization.
 *
 * A lane is a door for people who don't know what they want yet. Two kinds:
 *  - 'search' lanes are NAMED STREET SEARCHES (words joined with 'or' —
 *    websearch semantics AND space-separated terms): inclusion = the maker's own
 *    words match the lane's words, through the same LS-2 engine (same
 *    visibility law, same explainability). No merchant homework, ever — a
 *    shop joins a lane by being what it already says it is.
 *  - 'rule' lanes are deterministic predicates on existing facts (price,
 *    freshness, fulfillment kind, store age, live deals).
 *
 * Every lane must have: a deterministic inclusion rule, an honest name, an
 * empty-state story, and no merchant configuration burden. Ordering inside a
 * lane is newest-first — chronology is the law inside shared geography; no
 * lane is ranked. Registry lives in code: adding a lane is a reviewed change,
 * not CMS content.
 */
export type LaneRule = 'services' | 'under_25' | 'deals_now' | 'new_shops' | 'fresh_today'

export interface Lane {
  id: string
  title: string
  blurb: string
  /** The honest inclusion sentence shown on the lane page. */
  inclusion: string
  kind: 'search' | 'rule'
  /** search lanes: the registered street-search words. */
  q?: string
  rule?: LaneRule
}

export const LANES: Lane[] = [
  {
    id: 'food-drink', title: 'Food & drink', kind: 'search',
    q: 'bread or sourdough or coffee or bake or pastry or roast or rye or knots',
    blurb: 'Baked, brewed, and roasted on the street.',
    inclusion: 'Everything here is a shop or thing whose own words talk about food and drink.',
  },
  {
    id: 'home-light', title: 'Home & light', kind: 'search',
    q: 'candle or furniture or bench or oak or print or wall or home or shelf',
    blurb: 'Things that make a room yours.',
    inclusion: 'Everything here talks, in its maker’s words, about the home — furniture, candles, prints, walls.',
  },
  {
    id: 'soft-wearable', title: 'Soft & wearable', kind: 'search',
    q: 'wool or knit or scarf or blanket or booties or soft or merino or wear',
    blurb: 'Knitted, woven, and worn.',
    inclusion: 'Everything here is described by its maker with soft, knitted, wearable words.',
  },
  {
    id: 'help-hands', title: 'Help & hands', kind: 'rule', rule: 'services',
    blurb: 'People who do things, not just make things.',
    inclusion: 'Everything here is a service — booked, not shipped.',
  },
  {
    id: 'under-25', title: 'Under €25', kind: 'rule', rule: 'under_25',
    blurb: 'Small prices, real makers.',
    inclusion: 'Everything here starts under €25.',
  },
  {
    id: 'deals-now', title: 'Deals happening now', kind: 'rule', rule: 'deals_now',
    blurb: 'Moments the makers opened — still open.',
    inclusion: 'Every deal here is live right now; when a maker closes one, it leaves.',
  },
  {
    id: 'new-shops', title: 'New on the street', kind: 'rule', rule: 'new_shops',
    blurb: 'Doors that opened in the last month.',
    inclusion: 'Every shop here opened within the last 30 days. New makers start here — visible from day one.',
  },
  {
    id: 'fresh-today', title: 'Fresh today', kind: 'rule', rule: 'fresh_today',
    blurb: 'Put on the street in the last day.',
    inclusion: 'Everything here was published in the last 24 hours. Empty just means the street is still waking.',
  },
]

export const laneById = (id: string): Lane | null => LANES.find((l) => l.id === id) ?? null
