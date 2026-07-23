/**
 * dev:demo — the browsable demo world. Boots a REAL embedded PostgreSQL (persistent
 * data dir under .data/), migrates + seeds the capability registry, starts `nuxt dev`
 * against it, then populates a rich sample world THROUGH THE REAL API (dev-header
 * identity) so visibility, events, audits, and engagement all behave truthfully.
 * Idempotent: an already-seeded database is left alone.
 *
 * Demo photos are media_assets registry rows pointing at picsum.photos (the sandbox
 * storage adapter's URLs aren't browser-renderable; the registry contract allows any
 * URL — that's its whole point).
 *
 *   npm run dev:demo    → http://localhost:3000
 *
 * Sign in to the merchant side by setting localStorage['dof.dev-user-id'] to
 * DEMO_MERCHANT_USER (printed at the end) — the browser then IS Rosa.
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { migrate } from '../db/migrate'
import { seed } from '../db/seed'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PG_PORT = 54329
const APP = 'http://localhost:3000'
const DB_URL = `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/dof_dev`

export const DEMO_MERCHANT_USER = '11111111-1111-4111-8111-111111111111'
const EMBER_USER = '22222222-2222-4222-8222-222222222222'
const PIXEL_USER = '33333333-3333-4333-8333-333333333333'
const BAKERY_USER = '44444444-4444-4444-8444-444444444444'
const COFFEE_USER = '55555555-5555-4555-8555-555555555555'
const FURNITURE_USER = '66666666-6666-4666-8666-666666666666'
const FITNESS_USER = '77777777-7777-4777-8777-777777777777'
const CLEANING_USER = '88888888-8888-4888-8888-888888888888' 

// ————————————————————————————————————————————— infrastructure

async function bootPostgres(): Promise<void> {
  const { default: EmbeddedPostgres } = await import('embedded-postgres')
  const dataDir = join(ROOT, '.data', 'dev-pg')
  mkdirSync(dataDir, { recursive: true })
  const server = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PG_PORT, persistent: true,
  })
  try {
    await server.initialise()
  } catch { /* already initialised — persistent data dir */ }
  await server.start()
  try {
    await server.createDatabase('dof_dev')
  } catch { /* exists */ }
  const stop = async () => { try { await server.stop() } catch { /* already down */ } }
  process.on('SIGINT', () => void stop().then(() => process.exit(0)))
  process.on('SIGTERM', () => void stop().then(() => process.exit(0)))
}

function startNuxt(): void {
  const child = spawn('node', ['node_modules/nuxt/bin/nuxt.mjs', 'dev', '--cwd', ROOT], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, NUXT_DATABASE_URL: DB_URL, NUXT_IDENTITY_MODE: 'dev' },
  })
  child.on('exit', (code) => process.exit(code ?? 0))
}

async function waitForApp(): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const res = await fetch(`${APP}/api/v1/public/home`)
      if (res.ok) return
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('nuxt dev did not become ready')
}

// ————————————————————————————————————————————— API helpers (the real endpoints)

async function api(userId: string, method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${APP}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-dof-user-id': userId,
      'idempotency-key': crypto.randomUUID(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  const parsed = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`)
  return parsed
}

/** Anonymous visitor engagement (fires/saves/follows) with a stable cookie identity. */
async function visitor(visitorId: string, path: string): Promise<void> {
  const res = await fetch(`${APP}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `dof_visitor=${visitorId}` },
    body: '{}',
  })
  if (!res.ok) throw new Error(`visitor ${path} → ${res.status}`)
}

// ————————————————————————————————————————————— the sample world

interface MerchantSpec {
  userId: string
  displayName: string
  storeName: string
  handle: string
  palette: string
  tagline: string
  story: string
  promise: string
  photoSeed: string
  products: Array<{ title: string; price: number; description: string; onStore?: boolean; kind?: 'physical' | 'digital' | 'service' }>
  deals: Array<{ product: string; headline: string; story: string; daysAgo?: number }>
  sparks: Array<{ body: string; product?: string; photo?: boolean; daysAgo?: number }>
}

const WORLD: MerchantSpec[] = [
  {
    userId: DEMO_MERCHANT_USER, displayName: 'Rosa', storeName: 'Rosa Knits', handle: 'rosas-knits',
    palette: '#7c3aed', tagline: 'Soft things, made slowly.',
    story: 'Rosa Knits started at a kitchen table in 2019 — one person who cared too much about wool to do it halfway. Every blanket, scarf, and bootie is knitted, checked, and packed by the same two hands.',
    promise: 'If something isn’t right, we make it right — always.',
    photoSeed: 'wool',
    products: [
      { title: 'Lavender Blanket', price: 4500, description: 'A full-size throw in hand-dyed lavender merino. Heavy enough to mean it, soft enough to nap under.' },
      { title: 'Charcoal Wool Scarf', price: 2200, description: 'Two metres of tightly-knit charcoal wool. Survives Berlin winters; looks better each year.' },
      { title: 'Baby Booties', price: 1800, description: 'Tiny, ridiculous, indestructible. The most-gifted thing we make.' },
      { title: 'Test Swatch (backstage)', price: 500, description: 'A work-in-progress swatch — not on the store, so you can see what Hidden looks like.', onStore: false },
    ],
    deals: [
      { product: 'Lavender Blanket', headline: 'This weekend: every blanket ships free', story: 'We just finished a big batch of lavender blankets and want them keeping people warm, not sitting on our shelves. Order by Sunday night and shipping is on us.' },
    ],
    sparks: [
      { body: 'Fresh batch of lavender blankets coming off the needles this week — three left from the last one. The dye lot came out deeper than usual and honestly? We love it.', product: 'Lavender Blanket', photo: true, daysAgo: 0 },
      { body: 'Behind the scenes: winding forty skeins by hand because the winder broke. Character building. The scarves will be worth it.', photo: true, daysAgo: 1 },
      { body: 'We hit 100 blankets shipped this year. Thank you — every single one went to someone who chose small over fast. 🧶', daysAgo: 2 },
    ],
  },
  {
    userId: EMBER_USER, displayName: 'Jonas', storeName: 'Ember & Oak', handle: 'ember-and-oak',
    palette: '#b45309', tagline: 'Candles that smell like somewhere.',
    story: 'Ember & Oak pours small-batch candles in a converted garage in Leipzig. Each scent is built from a real memory — a bonfire, a bakery at 6am, rain on a hot road.',
    promise: 'Poured this month, never warehoused.',
    photoSeed: 'candle',
    products: [
      { title: 'Bonfire No. 3', price: 2800, description: 'Smoked cedar, birch tar, a little sweetness underneath. The campfire you didn’t have to build.' },
      { title: 'Bakery at Six', price: 2600, description: 'Warm butter, toasted sugar, yeast. Dangerous in the kitchen — you will want croissants.' },
      { title: 'Rain Road', price: 2600, description: 'Petrichor and warm asphalt. The smell of summer breaking.' },
    ],
    deals: [
      { product: 'Bonfire No. 3', headline: 'Two Bonfires, one fire: 2-for-1 until Friday', story: 'The autumn batch came out bigger than planned. Our overstock is your cozy problem now.' },
    ],
    sparks: [
      { body: 'Pouring day. 120 candles, one very tired arm, the whole street smells like a bakery. Bakery at Six restocks tomorrow morning.', photo: true, daysAgo: 0 },
      { body: 'A customer told us Bonfire No. 3 smells exactly like her grandfather’s cabin. That’s the whole job. That’s why we do this.', product: 'Bonfire No. 3', daysAgo: 1 },
    ],
  },
  {
    userId: PIXEL_USER, displayName: 'Mina', storeName: 'Pixel & Paper', handle: 'pixel-and-paper',
    palette: '#0f766e', tagline: 'Small prints for small walls.',
    story: 'Pixel & Paper makes A5 risograph prints in editions of fifty, then never again. Started as a way to use up leftover ink; became a tiny archive of moods.',
    promise: 'Editions of 50. When they’re gone, they’re gone.',
    photoSeed: 'print',
    products: [
      { title: 'Morning Kitchen (ed. 50)', price: 1500, description: 'Two-colour riso: steam, a window, a cat that refused to move. Edition of fifty, signed.' },
      { title: 'Night Bus (ed. 50)', price: 1500, description: 'Blue and fluorescent pink. The 3am ride home, romanticized exactly the right amount.' },
      { title: 'Tomato Season (ed. 50)', price: 1500, description: 'Red on cream. A love letter to August. 12 left.' },
    ],
    deals: [
      { product: 'Tomato Season (ed. 50)', headline: 'Last dozen of Tomato Season — then it’s gone forever', story: 'Edition of fifty means fifty. Twelve prints left, and we don’t reprint. Ever.' },
    ],
    sparks: [
      { body: 'New print day! “Morning Kitchen” is live — two-colour riso, edition of fifty. The cat in it sat on the original sketch, which felt like approval.', product: 'Morning Kitchen (ed. 50)', photo: true, daysAgo: 0 },
      { body: 'Ink update for the curious: we mix our teal from leftover blue + yellow drums. Zero-waste-ish, and no two editions are quite the same.', daysAgo: 2 },
    ],
  },
  {
    userId: BAKERY_USER, displayName: 'Amira', storeName: 'Grain & Crumb', handle: 'grain-and-crumb',
    palette: '#9a6b3f', tagline: 'Bread with a backbone.',
    story: 'Grain & Crumb is a two-oven bakery above a bike shop. We mill half our flour ourselves, ferment everything slowly, and sell out most days by noon — which we consider a feature, not a bug.',
    promise: 'Baked the morning you buy it. Never the day before.',
    photoSeed: 'bread',
    products: [
      { title: 'Friday Sourdough', price: 650, description: 'A 900g country loaf: 36-hour ferment, dark bake, crackling crust. The one we get texts about.' },
      { title: 'Rye & Raisin', price: 550, description: 'Dense, honest rye with soaked raisins. Toast it; thank us later.' },
      { title: 'Cardamom Knots (box of 4)', price: 800, description: 'Swedish-style, hand-tied, unreasonably fragrant. Warning: a box of four serves one.' },
    ],
    deals: [
      { product: 'Cardamom Knots (box of 4)', headline: 'Saturday only: knots at 6am, warm', story: 'The first batch leaves the oven at 5:40. Order tonight, collect warm at six, be insufferably smug by seven.', daysAgo: 1 },
    ],
    sparks: [
      { body: 'The new mill arrived. The whole street smells like toasted grain and the neighbours have stopped complaining and started queueing.', photo: true, daysAgo: 0 },
      { body: 'Sold out by 11:15 today — a record. Tomorrow we bake forty extra loaves. Tell your grandmother.', daysAgo: 3 },
    ],
  },
  {
    userId: COFFEE_USER, displayName: 'Tomás', storeName: 'Kettle Mountain', handle: 'kettle-mountain',
    palette: '#215c46', tagline: 'Small-lot coffee, roasted Tuesdays.',
    story: 'Kettle Mountain roasts single-farm lots in a garage on an actual hill. One roast day a week, everything shipped within 48 hours of the drum, farm names on every bag because they earned it.',
    promise: 'Roasted this week or we don\u2019t ship it.',
    photoSeed: 'coffee',
    products: [
      { title: 'Finca La Loma — washed', price: 1450, description: 'Huila, Colombia. Red apple, panela, a long clean finish. Our house benchmark.' },
      { title: 'Sítio Bela Vista — natural', price: 1550, description: 'Minas Gerais, Brazil. Strawberry jam in a cup. Divisive, beloved.' },
      { title: 'Subscription — one bag, monthly', price: 1400, description: 'The current roast, every month, no decisions required. Pause anytime.', kind: 'digital' },
    ],
    deals: [
      { product: 'Sítio Bela Vista — natural', headline: 'Last 12 bags of the Bela Vista lot', story: 'When a lot is gone it is gone — that is the whole point of small lots. Twelve bags left, then we wait a year.', daysAgo: 0 },
    ],
    sparks: [
      { body: 'Roast day. 62 kilos, four lots, one very hot garage. The Bela Vista naturals are the best we have ever had from this farm.', photo: true, daysAgo: 2 },
      { body: 'A customer emailed to say our coffee ruined hotel breakfast for them forever. Genuinely the nicest thing anyone has said about our work.', daysAgo: 4 },
    ],
  },
  {
    userId: FURNITURE_USER, displayName: 'Henrik', storeName: 'Oak & Understory', handle: 'oak-and-understory',
    palette: '#5b4a3f', tagline: 'Furniture your grandchildren will argue over.',
    story: 'Oak & Understory builds solid-wood furniture from storm-felled city trees. Every piece is numbered, photographed with the tree it came from, and built to be repaired, not replaced.',
    promise: 'Solid wood, visible joinery, lifetime repairs.',
    photoSeed: 'wood',
    products: [
      { title: 'Understory Bench No. 14', price: 68000, description: 'From the linden that came down on Parkstrasse in the March storm. 140cm, hand-cut dovetails, oil finish.' },
      { title: 'Shaker Peg Rail (1m)', price: 9500, description: 'The most useful metre of wood you will ever own. Oak, six pegs, ready to hang.' },
      { title: 'Board & Butter — cutting board', price: 5400, description: 'End-grain oak, wide as a good argument. Comes with our board butter and sharpening advice.' },
    ],
    deals: [
      { product: 'Board & Butter — cutting board', headline: 'Workshop seconds: boards with stories, 30% off', story: 'Three boards came out with knots too beautiful to hide and too irregular to sell at full price. Their loss is your kitchen\u2019s gain.', daysAgo: 2 },
    ],
    sparks: [
      { body: 'Bench No. 14 is finished. The linden it came from shaded a bus stop for sixty years — the grain kept the shade\u2019s softness. Photos do not do it justice, come see it.', product: 'Understory Bench No. 14', photo: true, daysAgo: 1 },
      { body: 'Repair day: a customer brought back a table we built in 2019 after a house move went badly. One hour, two clamps, good as new. This is the whole business model.', daysAgo: 5 },
    ],
  },
  {
    userId: FITNESS_USER, displayName: 'Dana', storeName: 'Second Wind', handle: 'second-wind',
    palette: '#b3452c', tagline: 'Strength coaching for people who hated gym class.',
    story: 'Second Wind is one coach, a small studio, and a firm belief that fitness was ruined for most people by being yelled at in school. Small groups, patient progressions, zero mirrors.',
    promise: 'No before photos. No yelling. Ever.',
    photoSeed: 'training',
    products: [
      { title: 'Foundations — 6-week small group', price: 24000, description: 'Six weeks, six people, twice a week. Learn to squat, hinge, push, pull, and actually enjoy it.', kind: 'service' },
      { title: '1:1 Coaching session', price: 7000, description: 'One hour, your goals, no judgement. First session includes a movement check-in.', kind: 'service' },
      { title: 'Kitchen Basics — nutrition guide', price: 1900, description: 'A 40-page PDF of real food for real schedules. No powders were harmed.', kind: 'digital' },
    ],
    deals: [
      { product: 'Foundations — 6-week small group', headline: 'Evening group: two spots left', story: 'The 6pm Foundations group starts Monday. Two spots left, and the 7am group is already full — which still surprises me.', daysAgo: 0 },
    ],
    sparks: [
      { body: 'Milestone in the studio today: a member deadlifted her bodyweight eight months after telling me she was "not a gym person". There is no such thing as not a gym person.', daysAgo: 0 },
      { body: 'New rule after a vote: the studio playlist is now member-curated. I have lost control and morale has never been higher.', daysAgo: 3 },
    ],
  },
  {
    userId: CLEANING_USER, displayName: 'Marta', storeName: 'Clean Slate', handle: 'clean-slate',
    palette: '#3d6b8f', tagline: 'Homes reset, not just cleaned.',
    story: 'Clean Slate is a three-person crew that treats cleaning like hospitality: same team every visit, a note when we leave, and your kettle filled because you will want tea when you get home.',
    promise: 'Same crew, every visit. Insured, vetted, kind.',
    photoSeed: 'home',
    products: [
      { title: 'The Reset — full home clean', price: 12000, description: 'Three hours, three of us, every room. The apartment equivalent of a deep breath.', kind: 'service' },
      { title: 'Fortnightly Standing Clean', price: 8500, description: 'Every other week, same crew, standing slot. The most cancelled-then-rebooked-within-a-day service we offer.', kind: 'service' },
      { title: 'Moving-Out Certificate Clean', price: 19000, description: 'Deposit-back standard, with a checklist your landlord can argue with (they won\u2019t).', kind: 'service' },
    ],
    deals: [
      { product: 'The Reset — full home clean', headline: 'New-client Reset: 20% off this month', story: 'Our Tuesday slot opened up for the first time in a year. One new household gets it — and the first Reset is 20% off while we get to know your home.', daysAgo: 1 },
    ],
    sparks: [
      { body: 'Today a client\u2019s note said "it smells like my childhood in here, in a good way". We use unscented products. That smell is just CLEAN. Case closed.', daysAgo: 0 },
      { body: 'Five years of Clean Slate this week. Same three of us as day one. Thank you to the 60 households who trust us with their keys.', photo: true, daysAgo: 4 },
    ],
  },
]

/**
 * The dev-header identities get real (verified) identity rows so the workspace ladder
 * reads honestly — otherwise every demo merchant is stuck at "confirm your email" and
 * the momentum opportunities (Release 0.8) never surface. Idempotent; runs every boot.
 */
async function seedIdentities(): Promise<void> {
  const db = new pg.Client({ connectionString: DB_URL })
  await db.connect()
  try {
    for (const m of WORLD) {
      await db.query(
        `INSERT INTO users (id, email, email_verified, display_name)
         VALUES ($1, $2, true, $3)
         ON CONFLICT (id) DO UPDATE SET email_verified = true`,
        [m.userId, `${m.handle}@demo.dof.dev`, m.displayName])
    }
  } finally {
    await db.end()
  }
}

async function seedWorld(): Promise<void> {
  console.log('… seeding the demo world through the real API (per-merchant idempotent)')

  const db = new pg.Client({ connectionString: DB_URL })
  await db.connect()
  const storeHandles: Record<string, string> = {}

  try {
    for (const m of WORLD) {
      // idempotent per merchant: an existing business means this persona is seeded
      const probe = await api(m.userId, 'GET', '/api/v1/workspace')
      if (probe.businesses.length > 0) { storeHandles[m.storeName] = m.handle; continue }
      const biz = await api(m.userId, 'POST', '/api/v1/businesses', { business_type: 'individual', display_name: m.displayName })
      const businessId = biz.business_id as string
      const store = await api(m.userId, 'POST', `/api/v1/businesses/${businessId}/stores`, { name: m.storeName, handle: m.handle })
      const storeId = store.store_id as string
      storeHandles[m.storeName] = m.handle

      await api(m.userId, 'PUT', `/api/v1/stores/${storeId}/brand-kit`, {
        name: m.storeName,
        palette: { primary: m.palette },
        voice: { tone: m.tagline, story: m.story, promise: m.promise },
      })

      // products (+ a picsum hero via a registry row — the sandbox adapter's URLs aren't renderable)
      const productIds: Record<string, string> = {}
      for (const [i, p] of m.products.entries()) {
        const created = await api(m.userId, 'POST', '/api/v1/products', {
          business_id: businessId,
          title: p.title,
          fulfillment_kind: p.kind ?? 'physical',
          description: { format: 'plain', content: p.description },
          default_price: { amount: p.price, currency: 'EUR' },
          ...(p.onStore === false ? {} : { publish_to_store_id: storeId }),
        })
        productIds[p.title] = created.product_id
        const mediaId = crypto.randomUUID()
        await db.query(
          `INSERT INTO media_assets (id, business_id, url, content_type, size_bytes, created_by)
           VALUES ($1, $2, $3, 'image/webp', 128000, $4)`,
          [mediaId, businessId, `https://picsum.photos/seed/${m.photoSeed}-${i}/800/600`, m.userId])
        await api(m.userId, 'POST', `/api/v1/products/${created.product_id}/media`, {
          media_id: mediaId, role: 'hero', alt_text: p.title,
        })
      }

      await api(m.userId, 'POST', `/api/v1/stores/${storeId}/publish`)

      for (const d of m.deals) {
        const createdDeal = await api(m.userId, 'POST', '/api/v1/deals', {
          product_id: productIds[d.product], store_id: storeId, headline: d.headline, story: d.story,
        })
        if (d.daysAgo) {
          await db.query(`UPDATE deals SET published_at = now() - ($2 || ' days')::interval WHERE id = $1`,
            [createdDeal.deal_id, String(d.daysAgo)])
        }
      }

      for (const [i, sp] of m.sparks.entries()) {
        let mediaId: string | null = null
        if (sp.photo) {
          mediaId = crypto.randomUUID()
          await db.query(
            `INSERT INTO media_assets (id, business_id, url, content_type, size_bytes, created_by)
             VALUES ($1, $2, $3, 'image/webp', 128000, $4)`,
            [mediaId, businessId, `https://picsum.photos/seed/${m.photoSeed}-spark-${i}/800/500`, m.userId])
        }
        const created = await api(m.userId, 'POST', '/api/v1/sparks', {
          business_id: businessId, store_id: storeId, body: sp.body,
          ...(mediaId ? { media_id: mediaId } : {}),
          ...(sp.product ? { product_id: productIds[sp.product] } : {}),
        })
        if (sp.daysAgo) {
          // a realistic timeline so Home shows a spread (and the caught-up divider works)
          await db.query(`UPDATE sparks SET published_at = now() - ($2 || ' days')::interval WHERE id = $1`,
            [created.spark_id, String(sp.daysAgo)])
        }
      }
    }

    // ——— anonymous visitors make the counts alive (fires, saves, follows).
    // IDEMPOTENT: reactions/saves/follows are toggles, so each visitor's feed is read
    // with their own cookie and only not-yet-engaged items are touched. Only deals and
    // sparks are reactable (the feed also carries store/maker/product voices).
    const visitors = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee']
    for (const [j, v] of visitors.entries()) {
      const mine = await fetch(`${APP}/api/v1/public/home`, { headers: { cookie: `dof_visitor=${v}` } })
        .then((r) => r.json()) as { items: Array<{ type: string; id: string; store_handle: string; viewer_reacted: boolean; viewer_saved: boolean; viewer_follows: boolean }> }
      for (const [i, item] of mine.items.entries()) {
        const reactable = item.type === 'deal' || item.type === 'spark'
        if (reactable && !item.viewer_reacted && (i + j) % 2 === 0) {
          await visitor(v, item.type === 'deal' ? `/api/v1/public/deals/${item.id}/react` : `/api/v1/public/sparks/${item.id}/react`)
        }
        if (item.type === 'deal' && j === 0 && !item.viewer_saved) {
          await visitor(v, `/api/v1/public/deals/${item.id}/save`)
        }
      }
      // each visitor follows a slice of the street (first two follow everyone)
      const handles = Object.values(storeHandles)
      for (const [k, handle] of handles.entries()) {
        if ((j < 2 || (k + j) % 3 === 0) && !mine.items.some((it) => it.store_handle === handle && it.viewer_follows)) {
          await visitor(v, `/api/v1/public/stores/${handle}/follow`)
        }
      }
    }
    console.log('✓ demo world seeded')
  } finally {
    await db.end()
  }
}

// ————————————————————————————————————————————— go

async function main(): Promise<void> {
  console.log('… starting embedded PostgreSQL (persistent, .data/dev-pg)')
  await bootPostgres()
  await migrate(DB_URL)
  await seed(DB_URL)
  console.log('✓ database ready —', DB_URL)
  startNuxt()
  await waitForApp()
  await seedIdentities()
  await seedWorld()
  console.log(`
——————————————————————————————————————————————————————————————
  DOF demo world is live · ${APP}

  CUSTOMER SIDE (no sign-in needed)
    ${APP}/discover                     the living Home (fire · save · follow)
    ${APP}/s/rosas-knits                Rosa Knits storefront (sparks · about · shelf)
    ${APP}/s/ember-and-oak              Ember & Oak storefront
    ${APP}/s/pixel-and-paper            Pixel & Paper storefront

  MERCHANT SIDE (be Rosa: in the browser console run)
    localStorage.setItem('dof.dev-user-id', '${DEMO_MERCHANT_USER}'); location.reload()

    ${APP}/                             workspace (posture · next opportunity)
    ${APP}/products                     composer + grid (incl. one Hidden product)
    ${APP}/deals                        create deal · fire/save counts coming back
    ${APP}/sparks                       spark composer + timeline
    ${APP}/store                        store identity (tagline · story · promise)
    ${APP}/orders … /analytics          future modules (each explains itself)
——————————————————————————————————————————————————————————————
`)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
