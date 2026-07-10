/**
 * Workspace shell E2E (UI-COM-001 §10): the built app, as a merchant meets it —
 * S0 noun budget, palette navigation, Surface Level reveals, postures, calm
 * notifications, and axe on the real pages.
 */
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function gotoFresh(page: Page, path = '/') {
  await page.goto(path)
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
  await page.waitForSelector('main#dof-main')
}

test('landing page renders the honest empty states and passes axe', async ({ page }) => {
  await gotoFresh(page)
  await expect(page.getByRole('heading', { name: 'Welcome to your workspace' })).toBeVisible()
  await expect(page.getByText('Your business health appears here')).toBeVisible()
  await expect(page.getByText('Ignite', { exact: true })).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
})

test('S0 shows exactly the five essential areas; raising the level reveals more', async ({ page }) => {
  await gotoFresh(page)
  const sidebar = page.locator('nav').first()
  await expect(sidebar.getByRole('button')).toHaveText(['Home', 'Products', 'Orders', 'Deals', 'Settings'])

  // raise via the user menu (the visible face of Progressive Complexity)
  await page.getByRole('button', { name: 'User menu' }).click()
  await page.getByRole('menuitem', { name: 'Show: Everything' }).click()
  await expect(sidebar.getByRole('button')).toHaveCount(14)
  await expect(sidebar.getByRole('button', { name: 'Inventory' })).toBeVisible()

  // persisted across reloads
  await page.reload()
  await expect(page.locator('nav').first().getByRole('button')).toHaveCount(14)
})

test('ask bar: mod+k opens, narrows, Enter navigates; recents recorded', async ({ page }) => {
  await gotoFresh(page)
  await page.keyboard.press('ControlOrMeta+k')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await page.keyboard.type('orders')
  await expect(dialog.getByRole('option', { name: /Go to Orders/ })).toBeVisible()
  await expect(dialog.getByRole('option', { name: /Go to Products/ })).toBeHidden()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/orders$/)
  await expect(page.getByText('A short to-do list with money attached.')).toBeVisible()

  // the term was recorded as a recent
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.getByRole('dialog').getByText('Recent')).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('option', { name: 'orders', exact: true })).toBeVisible()
})

test('coming-soon pages teach the opportunity and pass axe', async ({ page }) => {
  await gotoFresh(page, '/inventory')
  await expect(page.getByText('Counts where your products are', { exact: false })).toBeVisible()
  await expect(page.getByText('Inventory is on its way')).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
})

test('compact posture: bottom tab bar with the 5-slot budget and More sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 820 })
  await gotoFresh(page)
  // raise surface level so overflow exists (S0 fits the budget exactly)
  await page.evaluate(() => window.localStorage.setItem('dof.surface-level', 's3'))
  await page.reload()
  const tabBar = page.locator('nav').last()
  await expect(tabBar.getByRole('button')).toHaveCount(5) // 4 + More
  await tabBar.getByRole('button', { name: 'More' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'Analytics' }).click()
  await expect(page).toHaveURL(/\/analytics$/)
})

test('notification center opens with the designed silence; skip link is first tab stop', async ({ page }) => {
  await gotoFresh(page)
  await page.keyboard.press('Tab') // fresh document: first stop is the skip link
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()

  await page.getByRole('button', { name: 'Open notifications' }).click()
  await expect(page.getByRole('dialog')).toContainText('Nothing needs you. Enjoy the day.')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Open notifications' })).toBeFocused() // focus returns
})

test('breadcrumbs reflect location and navigate home', async ({ page }) => {
  await gotoFresh(page, '/deals')
  const crumbs = page.getByRole('navigation', { name: 'breadcrumb' })
  await expect(crumbs).toContainText('Deals')
  await crumbs.getByRole('button', { name: 'Home' }).click()
  await expect(page).toHaveURL(/\/$/)
})
