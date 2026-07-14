/**
 * Media Port (UX-AUTHOR-002 §D) over real HTTP + embedded PG with the sandbox storage twin.
 * Upload → registry row + URL; tenant gate (you upload only into YOUR business); type/size
 * validation; the stored media_id attaches to a product through the frozen Catalog API.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

async function merchant(): Promise<{ cookie: string; businessId: string }> {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `m-${uuidv7()}@example.com`, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
  return { cookie, businessId: biz.body.business_id }
}

function pngUpload(businessId: string): { body: FormData } {
  const form = new FormData()
  // tiny valid-enough PNG payload (the port validates type/size, not pixels)
  form.append('file', new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])], 'photo.png', { type: 'image/png' }))
  form.append('business_id', businessId)
  return { body: form }
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('POST /api/v1/media (sandbox storage twin)', () => {
  it('stores an image: registry row + resolvable URL', async () => {
    const { cookie, businessId } = await merchant()
    const res = await http.request('POST', '/api/v1/media', { headers: { cookie }, ...pngUpload(businessId) })
    expect(res.status).toBe(201)
    expect(res.body.media_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.url).toContain('sandbox.media.local')
    const { rows } = await container.pool.query(`SELECT business_id, content_type FROM media_assets`)
    expect(rows[0]).toMatchObject({ business_id: businessId, content_type: 'image/png' })
    expect(await container.media.resolve(res.body.media_id, businessId)).toBe(res.body.url)
  })

  it('refuses an upload into someone else’s business (masked 404)', async () => {
    const alice = await merchant()
    const mallory = await merchant()
    const res = await http.request('POST', '/api/v1/media', { headers: { cookie: mallory.cookie }, ...pngUpload(alice.businessId) })
    expect(res.status).toBe(404)
  })

  it('refuses non-image types', async () => {
    const { cookie, businessId } = await merchant()
    const form = new FormData()
    form.append('file', new File(['#!/bin/sh'], 'evil.sh', { type: 'application/x-sh' }))
    form.append('business_id', businessId)
    const res = await http.request('POST', '/api/v1/media', { headers: { cookie }, body: form })
    expect(res.status).toBe(422)
  })

  it('the stored media attaches to a product through the frozen Catalog API', async () => {
    const { cookie, businessId } = await merchant()
    const up = await http.request('POST', '/api/v1/media', { headers: { cookie }, ...pngUpload(businessId) })
    const product = await http.request('POST', '/api/v1/products', {
      headers: { cookie },
      body: {
        business_id: businessId, title: 'Lavender blanket', fulfillment_kind: 'physical',
        default_price: { amount: 4500, currency: 'EUR' },
        media: [{ media_id: up.body.media_id, alt_text: 'A lavender knitted blanket' }],
      },
    })
    expect(product.status).toBe(201)
    const { rows } = await container.pool.query(`SELECT media_id FROM product_media`)
    expect(rows[0].media_id).toBe(up.body.media_id)
  })
})
