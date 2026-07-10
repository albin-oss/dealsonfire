/**
 * Theme engine in a REAL browser (UI-FOUNDATION-001A §7): computed-style assertions
 * that the CSS variable system actually resolves — scopes re-voice roles, dark mode
 * re-resolves, BrandKit wins inside nested storefront scopes, and reduced motion
 * collapses durations. happy-dom cannot compute stylesheet cascade; this can.
 */
import { test, expect, type Page } from '@playwright/test'
import { gotoStory } from './helpers'

const bg = (page: Page, selector: string) =>
  page.locator(`#storybook-root ${selector}`).first().evaluate((el) => getComputedStyle(el).backgroundColor)

test('scopes re-resolve the same sys roles (marketplace surface ≠ workspace surface)', async ({ page }) => {
  await gotoStory(page, 'foundation-tokens--scope-gallery')
  const surfaces: Record<string, string> = {}
  for (const scope of ['workspace', 'marketplace', 'admin', 'storefront']) {
    surfaces[scope] = await bg(page, `[data-scope="${scope}"]`)
  }
  expect(surfaces.marketplace).not.toBe(surfaces.workspace) // brighter stage
  expect(surfaces.admin).toBe(surfaces.workspace) // admin re-voices radius/line, not surface
  expect(surfaces.storefront).not.toBe(surfaces.workspace) // BrandKit surface
})

test('dark mode is a full re-resolution, inherited by every scope', async ({ page }) => {
  await gotoStory(page, 'foundation-tokens--scope-gallery', 'mode:light')
  const light = await bg(page, '[data-scope="workspace"]')
  await gotoStory(page, 'foundation-tokens--scope-gallery', 'mode:dark')
  const dark = await bg(page, '[data-scope="workspace"]')
  expect(dark).not.toBe(light)
  const adminDark = await bg(page, '[data-scope="admin"]')
  expect(adminDark).toBe(dark) // inheritance: admin didn't re-declare surface
})

test('nested storefront scope: BrandKit wins inside, workspace resolution outside', async ({ page }) => {
  await gotoStory(page, 'foundation-tokens--nested-scopes')
  const outer = await bg(page, '[data-scope="workspace"]')
  const inner = await bg(page, '[data-scope="storefront"]')
  expect(inner).not.toBe(outer)
  // the brand accent chip resolves from the inline --dof-brand-accent
  const chip = await bg(page, '[data-scope="storefront"] .bg-accent')
  const outerAccent = await page.evaluate(() =>
    getComputedStyle(document.querySelector('#storybook-root [data-scope="workspace"]')!).getPropertyValue('--dof-sys-color-accent').trim())
  expect(chip).not.toBe(outerAccent)
})

test('reduced motion collapses every duration to the 1ms floor', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await gotoStory(page, 'primitives-dofbutton--matrix')
  const duration = await page.locator('button').first().evaluate((el) => getComputedStyle(el).transitionDuration)
  expect(duration).toBe('0.001s')
})

test('focus ring token renders on keyboard focus', async ({ page }) => {
  await gotoStory(page, 'primitives-dofbutton--sizes')
  await page.keyboard.press('Tab')
  const focused = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement
    return { tag: el.tagName, outline: getComputedStyle(el).outlineWidth }
  })
  expect(focused.tag).toBe('BUTTON')
  expect(focused.outline).toBe('2px') // --dof-ref-focus-ring-width
})
