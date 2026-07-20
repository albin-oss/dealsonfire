/**
 * Email Verification E2E (CAP-R1-ID-002). The browser half: the /verify page's honest
 * states and the enumeration-proof resend affordance. The token happy-path (verify →
 * onboarding redirect) needs a database and is proven over HTTP+embedded PostgreSQL in
 * tests/integration/identity/auth.test.ts; here we prove render, a11y, and resend UX
 * against the DB-less app server.
 */
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
}

// Same as axeClean but tolerates ONE known, flagged best-practice finding: DofProblem
// renders its title as <h3> under the shell's <h1>, tripping heading-order wherever an
// error banner shows (login/register/verify). WCAG 2.x A/AA must still be spotless; this
// pins the finding so any NEW violation fails the gate. Tracked for a DS-level fix.
async function axeCleanExceptHeadingOrder(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  const unexpected = results.violations.filter((v) => v.id !== 'heading-order')
  expect(unexpected, JSON.stringify(unexpected, null, 2)).toEqual([])
  for (const v of results.violations) expect(v.tags).not.toContain('wcag2a')
}

test('no token → pending state invites the user to check their inbox, axe-clean', async ({ page }) => {
  await page.goto('/verify')
  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible()
  await expect(page.getByText('Check your inbox.')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send a new link' })).toBeVisible()
  await axeClean(page)
})

test('an invalid/expired token shows the expiry message with a resend affordance', async ({ page }) => {
  await page.goto('/verify?token=this-is-not-a-real-token-value')
  await expect(page.getByText('That link is no longer valid')).toBeVisible()
  await expect(page.getByText(/expire after 30 minutes/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send a new link' })).toBeVisible()
  await axeCleanExceptHeadingOrder(page)
})

test('resend answers uniformly (enumeration-proof) — the form yields a calm confirmation', async ({ page }) => {
  await page.goto('/verify')
  await page.getByRole('textbox', { name: 'Email' }).fill('rosa@example.com')
  await page.getByRole('button', { name: 'Send a new link' }).click()
  await expect(page.getByText('On its way.', { exact: true })).toBeVisible()
  // the form is replaced by the confirmation — no oracle about whether the address exists
  await expect(page.getByRole('textbox', { name: 'Email' })).toHaveCount(0)
})
