/**
 * Merchant Workspace first-login E2E (CAP-R1-MER-001 → PROMPT-022 Business Companion).
 * The Home renders the welcome, the Next Opportunity hero (with its reasoning), and the
 * quick actions, and stays axe-clean. This app server runs WITHOUT a database, so the
 * progress read fails → the hero degrades to the standing Ignite invitation — which is
 * itself the "never a broken hero" guarantee. The populated ladder + journey narrative
 * are proven over HTTP+PG in tests/integration/merchant/workspace-progress.test.ts.
 */
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function gotoWorkspace(page: Page) {
  await page.goto('/')
  await page.waitForSelector('main#dof-main')
  await expect(page.getByRole('heading', { name: 'Welcome to your workspace' })).toBeVisible()
}

test('the Home leads with ONE Next Opportunity — title, reasoning, one action', async ({ page }) => {
  await gotoWorkspace(page)
  // fallback opportunity (no DB): the standing Ignite invitation, reasoning always shown
  await expect(page.getByRole('heading', { name: 'Create your store' })).toBeVisible()
  await expect(page.getByText(/DOF drafts everything/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Ignite' })).toBeVisible()
  // a mentor never repeats itself: the ember quick action yields while the hero points at Ignite
  await expect(page.getByRole('button', { name: /Create your store — about 4 minutes/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Add your first product/ })).toBeVisible()
})

test('"Not now" is respected — the hero yields quietly and nothing nags', async ({ page }) => {
  await gotoWorkspace(page)
  await page.getByRole('button', { name: 'Not now' }).click()
  await expect(page.getByRole('button', { name: 'Start Ignite' })).toHaveCount(0)
  // the workspace stays calm and fully usable
  await expect(page.getByRole('heading', { name: 'Recent activity' })).toBeVisible()
})

test('the workspace is axe-clean (WCAG)', async ({ page }) => {
  await gotoWorkspace(page)
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
})
