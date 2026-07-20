/**
 * Production smoke (Release 1.5 — First Light). Read-only golden-path checks against a
 * deployed DOF: no accounts created, no data written, safe to run against production at
 * any time. Exit 0 = every check green.
 *
 *   npm run smoke -- https://your-deployment.example
 */
const base = (process.argv[2] ?? '').replace(/\/$/, '')
if (!base.startsWith('http')) {
  console.error('usage: npm run smoke -- https://your-deployment.example')
  process.exit(2)
}

interface Check { name: string; pass: boolean; note: string }
const checks: Check[] = []

async function check(name: string, run: () => Promise<string>): Promise<void> {
  try {
    checks.push({ name, pass: true, note: await run() })
  } catch (error) {
    checks.push({ name, pass: false, note: (error as Error).message })
  }
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

await check('home page (SSR)', async () => {
  const res = await fetch(`${base}/home`)
  expect(res.ok, `status ${res.status}`)
  const html = await res.text()
  expect(html.includes('Today on DOF'), 'missing the Home heading')
  return `200, ${Math.round(html.length / 1024)}KB`
})

await check('home feed API', async () => {
  const res = await fetch(`${base}/api/v1/public/home`)
  expect(res.ok, `status ${res.status}`)
  const body = await res.json() as { items: unknown[] }
  expect(Array.isArray(body.items), 'items missing')
  expect((res.headers.get('cache-control') ?? '').includes('private'), 'feed must be private')
  return `200, ${body.items.length} items`
})

await check('visibility masking (V6)', async () => {
  const res = await fetch(`${base}/api/v1/public/stores/smoke-nonexistent-shop`)
  expect(res.status === 404, `expected 404, got ${res.status}`)
  return '404 as required'
})

await check('security headers', async () => {
  const res = await fetch(`${base}/home`)
  const required = ['x-content-type-options', 'x-frame-options', 'referrer-policy']
  for (const header of required) expect(res.headers.has(header), `missing ${header}`)
  const https = base.startsWith('https')
  if (https) {
    expect(res.headers.has('strict-transport-security'), 'missing HSTS (production)')
    expect(res.headers.has('content-security-policy'), 'missing CSP (production)')
  }
  return https ? 'baseline + HSTS + CSP' : 'baseline (non-TLS target: HSTS/CSP not expected)'
})

await check('discover 301s home', async () => {
  const res = await fetch(`${base}/discover`, { redirect: 'manual' })
  expect(res.status === 301, `expected 301, got ${res.status}`)
  expect((res.headers.get('location') ?? '').includes('/home'), 'wrong redirect target')
  return '301 → /home'
})

await check('cron endpoint fails closed', async () => {
  const res = await fetch(`${base}/api/internal/outbox-dispatch`)
  if (base.startsWith('https')) {
    expect(res.status === 401 || res.status === 503, `expected 401/503, got ${res.status}`)
    return `${res.status} without secret`
  }
  // dev/local leaves the endpoint open when no secret is set (by design); just reachability
  expect(res.status === 200 || res.status === 401 || res.status === 503, `unexpected ${res.status}`)
  return `${res.status} (non-TLS target: fail-closed not asserted)`
})

const width = Math.max(...checks.map((c) => c.name.length))
for (const c of checks) console.log(`${c.pass ? '✓' : '✗'} ${c.name.padEnd(width)}  ${c.note}`)
const failed = checks.filter((c) => !c.pass).length
console.log(failed === 0 ? '\nsmoke: all green' : `\nsmoke: ${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
