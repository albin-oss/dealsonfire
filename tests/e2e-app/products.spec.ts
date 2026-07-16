/**
 * Products page (Composer + grid, Release 0.2) — renders without a backend (this app
 * server has no DB: the workspace read fails, the composer still teaches) and stays
 * axe-clean. The DB-backed publish→view→copy loop is proven over HTTP+PG in
 * tests/integration/commerce/listings.test.ts.
 */
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('the composer renders and is axe-clean (WCAG)', async ({ page }) => {
  await page.goto('/products')
  await page.waitForSelector('main#dof-main')
  await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
})

test('the public product page 404s honestly when nothing is visible', async ({ page }) => {
  const res = await page.goto(`/s/nobody-here/p/00000000-0000-7000-8000-000000000000`)
  expect(res?.status()).toBe(404)
})

test('the deals page renders and is axe-clean (WCAG)', async ({ page }) => {
  await page.goto('/deals')
  await page.waitForSelector('main#dof-main')
  await expect(page.getByRole('heading', { name: 'Deals', exact: true })).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
})

test('the public deal page 404s honestly when nothing is visible', async ({ page }) => {
  const res = await page.goto(`/s/nobody-here/d/00000000-0000-7000-8000-000000000000`)
  expect(res?.status()).toBe(404)
})

test('the discover feed renders publicly and is axe-clean (WCAG)', async ({ page }) => {
  await page.goto('/discover')
  await expect(page.getByRole('heading', { name: 'Today’s deals' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'filter deals' })).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
})

test('the store identity page renders and is axe-clean (WCAG)', async ({ page }) => {
  await page.goto('/store')
  await page.waitForSelector('main#dof-main')
  await expect(page.getByRole('heading', { name: 'Your store' })).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
})
