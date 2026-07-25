/**
 * Public street E2E (Increment 13 — roadmap #24/#25): the customer-facing surfaces
 * stay axe-clean and every keyboard stop shows a visible focus ring. This app server
 * runs WITHOUT a database, so /home and /shops render their honest empty/skeleton
 * states — landmarks, headings, contrast, and focus discipline are exactly what a
 * first-time keyboard or screen-reader visitor meets first. Populated-street a11y
 * is covered visually in the increment probes; data reads over HTTP+PG live in
 * tests/integration.
 */
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
}

test('the street (/home) is axe-clean (WCAG)', async ({ page }) => {
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: 'Today on DOF' })).toBeVisible()
  await expectAxeClean(page)
})

test('the directory (/shops) is axe-clean (WCAG)', async ({ page }) => {
  await page.goto('/shops')
  await expect(page.getByRole('heading', { name: 'Shops on DOF' })).toBeVisible()
  await expectAxeClean(page)
})

test('every keyboard stop on the street shows a visible focus ring', async ({ page }) => {
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: 'Today on DOF' })).toBeVisible()
  const bare: string[] = []
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return null
      const ringed = (e: Element) => {
        const s = getComputedStyle(e)
        return s.outlineStyle !== 'none' && s.outlineWidth !== '0px'
      }
      // the ring may live on a focus-within wrapper (the search box idiom)
      let ok = ringed(el)
      let a: Element | null = el.parentElement
      for (let d = 0; a && d < 3 && !ok; d++, a = a.parentElement) ok = ringed(a)
      return { ok, label: `${el.tagName}:${(el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 30)}` }
    })
    if (!info) break
    if (!info.ok) bare.push(info.label)
  }
  expect(bare, `focusable elements without a visible ring: ${bare.join(', ')}`).toEqual([])
})
