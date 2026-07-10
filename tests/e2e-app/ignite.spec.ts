/**
 * The Ignite journey E2E (UI-COM-002 §10): the complete first-merchant path through
 * the frozen score — plus resume, the import door, and the graceful launch problem
 * (this app server runs without a database; the saga must educate and offer retry,
 * never lose the draft). Real-launch verification runs against a dev DB manually.
 */
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function freshIgnite(page: Page) {
  await page.goto('/ignite')
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Turn what you love into a store.' })).toBeVisible()
}

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
}

async function throughToReveal(page: Page) {
  await page.getByRole('button', { name: "Let's start" }).click()
  await page.getByPlaceholder('my knitted baby blankets…').fill('my knitted baby blankets')
  await page.getByRole('button', { name: 'Continue' }).click()

  // the Mirror: three identities, choice preserved as a radiogroup
  const identities = page.getByRole('radio')
  await expect(identities).toHaveCount(3)
  await identities.first().click()
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByLabel('What is it called?').fill('Lavender baby blanket')
  await page.getByLabel('Starting price').fill('32')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('Set up “Blankets & Co.” around what you told me.')).toBeVisible()
}

test('the five-minute journey: three questions, the mirror, the reveal bundle', async ({ page }) => {
  await freshIgnite(page)
  await expect(page.getByText('about 4 minutes, 3 questions')).toBeVisible()
  await throughToReveal(page)

  // quartet: evidence cites the merchant's own words; assumptions never hidden
  await expect(page.getByText('You said: “my knitted baby blankets”')).toBeVisible()
  await expect(page.locator('[aria-label="assumptions"]')).toBeVisible()
  await expect(page.getByText('fairly sure')).toBeVisible() // calibrated language, no percentages

  // progressive complexity: advanced items hidden until asked for
  await expect(page.getByLabel('Inventory', { exact: true })).toBeHidden()
  await page.getByRole('button', { name: /Advanced/ }).click()
  await expect(page.getByText('Off until it earns its keep', { exact: false })).toBeVisible()

  // the live preview reflects name, product, and price
  const preview = page.getByRole('img', { name: /Preview of the Blankets & Co\. storefront/ })
  await expect(preview).toContainText('Lavender baby blanket')
  await expect(preview).toContainText('€32')
  await axeClean(page)
})

test('drafts persist: leaving and returning lands exactly where the merchant left off', async ({ page }) => {
  await freshIgnite(page)
  await page.getByRole('button', { name: "Let's start" }).click()
  await page.getByPlaceholder('my knitted baby blankets…').fill('hand poured candles')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('radio')).toHaveCount(3)

  await page.reload() // the interruption
  await expect(page.getByRole('radio')).toHaveCount(3) // resumed at the mirror
  await expect(page.getByText('question 2 of 3')).toBeVisible()

  // back is safe: the idea survived
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByPlaceholder('my knitted baby blankets…')).toHaveValue('hand poured candles')
})

test('the bring-it door: a CSV seeds products; platforms are honestly pending', async ({ page }) => {
  await freshIgnite(page)
  await page.getByRole('button', { name: "Let's start" }).click()
  await page.getByRole('button', { name: /Already selling somewhere/ }).click()

  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Shopify')).toBeVisible()
  await expect(sheet.getByText('on its way').first()).toBeVisible() // honest pending, no fake OAuth
  await sheet.getByText('Etsy').click()
  await expect(sheet.getByText('Etsy import arrives with the connection backend', { exact: false })).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles({
    name: 'products.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('name,price\nLavender Soap,14.99\nRose Soap,12\n,9.99'),
  })
  await expect(page.getByText('2 products ready from your file · 1 rows skipped', { exact: false })).toBeVisible()

  // first-thing pre-fills from the file
  await page.getByPlaceholder('my knitted baby blankets…').fill('handmade soap')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('radio').first().click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByLabel('What is it called?')).toHaveValue('Lavender Soap')
  await expect(page.getByLabel('Starting price')).toHaveValue('14.99')
})

test('launch without a backend: the saga educates, keeps the draft, and offers retry', async ({ page }) => {
  await freshIgnite(page)
  await throughToReveal(page)
  await page.getByRole('button', { name: 'Make it my store' }).click()

  await expect(page.getByText(/We paused at the business step/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Keep my draft & exit' })).toBeVisible()
  await axeClean(page)

  // the draft survived the failure — re-entering Ignite resumes, nothing lost
  await page.getByRole('button', { name: 'Keep my draft & exit' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/ignite')
  await expect(page.getByText(/We paused|Setting the table|nothing left to fill in/).first()).toBeVisible()
})
