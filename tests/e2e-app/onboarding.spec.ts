/**
 * Guided onboarding E2E (CAP-R1-MER-002). Drives the conversational flow end to end: the
 * welcome, each question (single- and multi-select), the progress indicator, and arrival at
 * the review with the "create my business" hand-off. Axe-clean throughout. The personalized
 * recommendation content needs a database (proven over HTTP+PG in
 * tests/integration/merchant/onboarding.test.ts); this app server runs without one, so the
 * flow degrades gracefully — which is the "onboarding never blocks" guarantee.
 */
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function answerAndAdvance(page: Page) {
  // wait for the step's options to render (single-select radios or multi-select chips)
  await page.locator('[role=radio], [aria-pressed]').first().waitFor({ state: 'visible' })
  const radios = page.locator('[role=radio]')
  if (await radios.count()) await radios.first().click()
  else await page.locator('[aria-pressed]').first().click()
  const advance = page.getByRole('button', { name: /^(Continue|See what DOF suggests)$/ })
  await expect(advance).toBeEnabled()
  await advance.click()
}

test('the merchant completes guided discovery and reaches the create-business hand-off', async ({ page }) => {
  await page.goto('/onboarding')
  await expect(page.getByRole('heading', { name: 'Welcome to DOF' })).toBeVisible()
  await expect(page.getByText('Question 1 of 6')).toBeVisible()

  // first question is axe-clean
  const q1 = await new AxeBuilder({ page }).analyze()
  expect(q1.violations, JSON.stringify(q1.violations, null, 2)).toEqual([])

  // walk all six questions
  for (let i = 0; i < 6; i++) await answerAndAdvance(page)

  // arrives at the review with the hand-off into business creation
  await expect(page.getByRole('heading', { name: /how I’ll tailor DOF/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create my business' })).toBeVisible()

  const review = await new AxeBuilder({ page }).analyze()
  expect(review.violations, JSON.stringify(review.violations, null, 2)).toEqual([])
})

test('progress and back navigation work', async ({ page }) => {
  await page.goto('/onboarding')
  await expect(page.getByText('Question 1 of 6')).toBeVisible()
  await answerAndAdvance(page)
  await expect(page.getByText('Question 2 of 6')).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByText('Question 1 of 6')).toBeVisible()
})
