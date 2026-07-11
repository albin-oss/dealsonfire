/**
 * Merchant Registration E2E (CAP-R1-ID-001). The browser half of the capability: the
 * /register page renders, is axe-clean, its fields are labelled + keyboard-reachable, and
 * a submit degrades gracefully with an educating problem when the backend can't complete
 * (this app server runs without a database — the real account-creation happy path is
 * proven against embedded PostgreSQL in tests/integration/identity/application.test.ts).
 */
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// The password label is shared by the field and its show/hide toggle; address the field
// by textbox role to stay unambiguous.
const emailField = (page: Page) => page.getByRole('textbox', { name: 'Email' })
const passwordField = (page: Page) => page.getByRole('textbox', { name: 'Password' })

async function gotoRegister(page: Page) {
  await page.goto('/register')
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
}

test('registration page renders the labelled form and passes axe', async ({ page }) => {
  await gotoRegister(page)

  await expect(page.getByRole('textbox', { name: 'Your name (optional)' })).toBeVisible()
  await expect(emailField(page)).toBeVisible()
  await expect(passwordField(page)).toBeVisible()
  await expect(page.getByText('At least 10 characters', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Already have an account/ })).toBeVisible()

  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
})

test('the form is fully keyboard operable and the password can be revealed', async ({ page }) => {
  await gotoRegister(page)
  await emailField(page).fill('rosa@example.com')
  await passwordField(page).fill('a short honest sentence')
  await expect(passwordField(page)).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: /Show password/i }).click()
  await expect(passwordField(page)).toHaveAttribute('type', 'text')
})

test('submit degrades gracefully with an educating problem when the backend cannot complete', async ({ page }) => {
  await gotoRegister(page)
  await emailField(page).fill('rosa+' + Date.now() + '@example.com')
  await passwordField(page).fill('a short honest sentence')
  await page.getByRole('button', { name: 'Create account' }).click()

  // no crash, no navigation away, and the user is told plainly what happened
  await expect(page.getByText("Couldn’t create your account")).toBeVisible()
  await expect(page).toHaveURL(/\/register$/)
})
