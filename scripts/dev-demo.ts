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
  products: Array<{ title: string; price: number; description: string; onStore?: boolean }>
  deals: Array<{ product: string; headline: string; story: string }>
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
]

async function seedWorld(): Promise<void> {
  // idempotency probe: Rosa already has a business → the world exists
  const probe = await api(DEMO_MERCHANT_USER, 'GET', '/api/v1/workspace')
  if (probe.businesses.length > 0) {
    console.log('✓ demo world already seeded — leaving it alone')
    return
  }
  console.log('… seeding the demo world through the real API')

  const db = new pg.Client({ connectionString: DB_URL })
  await db.connect()
  const storeHandles: Record<string, string> = {}

  try {
    for (const m of WORLD) {
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
          fulfillment_kind: 'physical',
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
        await api(m.userId, 'POST', '/api/v1/deals', {
          product_id: productIds[d.product], store_id: storeId, headline: d.headline, story: d.story,
        })
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

    // ——— anonymous visitors make the counts alive (fires, saves, follows)
    const home = await fetch(`${APP}/api/v1/public/home`).then((r) => r.json()) as {
      items: Array<{ type: string; id: string; store_handle: string }>
    }
    const visitors = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc']
    for (const [i, item] of home.items.entries()) {
      for (const [j, v] of visitors.entries()) {
        if ((i + j) % 2 === 0) {
          await visitor(v, item.type === 'deal' ? `/api/v1/public/deals/${item.id}/react` : `/api/v1/public/sparks/${item.id}/react`)
        }
      }
      if (item.type === 'deal') await visitor(visitors[0]!, `/api/v1/public/deals/${item.id}/save`)
    }
    for (const handle of Object.values(storeHandles)) {
      await visitor(visitors[0]!, `/api/v1/public/stores/${handle}/follow`)
      await visitor(visitors[1]!, `/api/v1/public/stores/${handle}/follow`)
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
