/**
 * Merchant Workspace first-login E2E (CAP-R1-MER-001). The workspace renders the welcome,
 * quick actions, and the Getting Started timeline, and stays axe-clean. The populated
 * ladder needs a database (proven over HTTP+PG in tests/integration/merchant/
 * workspace-progress.test.ts); this app server runs without one, so the timeline shows its
 * graceful placeholder — which is itself the "never blocks the workspace" guarantee.
 */
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function gotoWorkspace(page: Page) {
  await page.goto('/')
  await page.waitForSelector('main#dof-main')
  await expect(page.getByRole('heading', { name: 'Welcome to your workspace' })).toBeVisible()
}

test('the workspace shows the welcome, quick actions, and the Getting Started timeline', async ({ page }) => {
  await gotoWorkspace(page)
  await expect(page.getByRole('button', { name: /Create your store/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Getting started' })).toBeVisible()
})

test('the workspace is axe-clean (WCAG)', async ({ page }) => {
  await gotoWorkspace(page)
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
})
