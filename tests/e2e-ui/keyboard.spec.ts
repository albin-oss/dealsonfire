/** Gate G-3 keyboard suite: full pattern operability without a pointer (§11). */
import { test, expect } from '@playwright/test'
import { gotoStory } from './helpers'

test('form primitives are fully keyboard-operable', async ({ page }) => {
  await gotoStory(page, 'primitives-choices--checkboxes')
  await page.keyboard.press('Tab')
  const first = page.getByRole('checkbox').first()
  await expect(first).toBeFocused()
  await expect(first).toHaveAttribute('data-state', 'checked')
  await page.keyboard.press('Space')
  await expect(first).toHaveAttribute('data-state', 'unchecked')
})

test('select opens with keyboard, arrows move, Enter picks, focus returns', async ({ page }) => {
  await gotoStory(page, 'primitives-overlays--select')
  const trigger = page.getByRole('combobox').first()
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('listbox')).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(trigger).toContainText(/Physical|Digital/)
})

test('undo pattern: archive then undo entirely by keyboard', async ({ page }) => {
  await gotoStory(page, 'patterns-undoable--archive-with-undo')
  const archive = page.getByRole('button', { name: 'Archive' }).first()
  await archive.focus()
  await page.keyboard.press('Enter')
  const undo = page.getByRole('button', { name: 'Undo' })
  await expect(undo).toBeVisible()
  await undo.focus()
  await page.keyboard.press('Enter')
  await expect(undo).toBeHidden()
  await expect(page.getByText('Ignite self-demotion signal', { exact: false })).toBeVisible()
})

test('run shell traps focus and Esc exits with progress kept', async ({ page }) => {
  await gotoStory(page, 'layouts-shells--run')
  await page.getByRole('button', { name: 'Start packing run' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await page.getByRole('button', { name: 'Packed' }).click()
  await expect(dialog).toContainText('1 of 6 packed')
  // Tab cycles inside the dialog only
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab')
  await expect.poll(async () => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: 'Start packing run' })).toBeFocused() // focus restored
})

test('R3 danger: typed challenge gates the confirm button', async ({ page }) => {
  await gotoStory(page, 'patterns-proposal-confirmation--danger-confirmation')
  await page.getByRole('button', { name: 'Close store…' }).click()
  const confirm = page.getByRole('button', { name: 'Close store', exact: true })
  await expect(confirm).toBeDisabled()
  await page.getByLabel('Type the store handle to confirm').fill('grandma-soaps')
  await expect(confirm).toBeEnabled()
})

test('dialog: opens, traps, Esc closes, focus returns to trigger', async ({ page }) => {
  await gotoStory(page, 'primitives-surfaces--dialog')
  const trigger = page.getByRole('button', { name: 'Publish product…' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Publish "Lavender Soap"?')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('workspace compact: 5-slot tab bar, More opens the overflow sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await gotoStory(page, 'layouts-workspace--seven-nouns-overflow')
  const tabBar = page.locator('nav').last()
  await expect(tabBar.getByRole('button')).toHaveCount(5) // 4 items + More
  await tabBar.getByRole('button', { name: 'More' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'Insights' }).click()
  await expect(sheet).toBeHidden()
})

test('toast region: notice appears quiet and dismisses by keyboard', async ({ page }) => {
  await gotoStory(page, 'primitives-surfaces--toasts')
  await page.getByRole('button', { name: 'Sticky (money)' }).click()
  const notice = page.getByText('Payout needs attention.')
  await expect(notice).toBeVisible()
  // the story's play function already queued another notice — dismiss THIS one
  const card = page.getByRole('status').locator('.pointer-events-auto', { hasText: 'Payout needs attention.' })
  const dismiss = card.getByRole('button', { name: 'Dismiss' })
  await dismiss.focus()
  await page.keyboard.press('Enter')
  await expect(notice).toBeHidden()
})

