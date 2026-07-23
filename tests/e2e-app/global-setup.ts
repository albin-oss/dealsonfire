/**
 * App e2e warmup (Increment 09) — the cold-boot flake's structural fix: the FIRST
 * test used to pay the server's cold-render cost against its own timeout (bit three
 * times: 37s first runs, one arbitrary victim each time). Warm the SSR paths once,
 * before any test's clock starts.
 */
export default async function globalSetup(): Promise<void> {
  const base = 'http://127.0.0.1:3100'
  const deadline = Date.now() + 60_000
  for (const path of ['/', '/home', '/products']) {
    while (Date.now() < deadline) {
      try {
        const res = await fetch(base + path, { redirect: 'manual' })
        if (res.status < 500) break
      } catch { /* server still settling */ }
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}
